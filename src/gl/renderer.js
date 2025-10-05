(function(){
  class GLRenderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl', { alpha:false, antialias:false, premultipliedAlpha:false });
      if (!gl) throw new Error('WebGL not available');
      this.gl = gl;
      const vsSrc = `
        attribute vec2 a_pos;
        attribute vec2 a_uv;
        attribute vec4 a_color;
        attribute float a_fog;
        uniform vec2  u_viewSize;
        uniform float u_roll;
        uniform vec2  u_pivot;
        varying vec2 v_uv;
        varying vec4 v_color;
        varying float v_fog;
        void main(){
          vec2 p = a_pos - u_pivot;
          float s = sin(u_roll), c = cos(u_roll);
          p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + u_pivot;
          vec2 clip = vec2((p.x/u_viewSize.x)*2.0 - 1.0,
                           1.0 - (p.y/u_viewSize.y)*2.0);
          gl_Position = vec4(clip,0.0,1.0);
          v_uv = a_uv; v_color = a_color; v_fog = a_fog;
        }`;
      const fsSrc = `
        precision mediump float;
        uniform sampler2D u_tex;
        uniform int u_useTex;
        uniform int u_fogEnabled;
        uniform vec3 u_fogColor;
        varying vec2 v_uv;
        varying vec4 v_color;
        varying float v_fog;
        void main(){
          vec4 base = (u_useTex==1)? texture2D(u_tex, v_uv) : vec4(1.0);
          vec4 shaded = vec4(base.rgb * v_color.rgb, base.a * v_color.a);
          if (u_fogEnabled == 1) {
            float f = clamp(v_fog, 0.0, 1.0);
            shaded.rgb = mix(shaded.rgb, u_fogColor, f);
          }
          gl_FragColor = shaded;
        }`;
      const prog = this._createProgram(vsSrc, fsSrc);
      gl.useProgram(prog);
      this.prog = prog;
      this.a_pos   = gl.getAttribLocation(prog, 'a_pos');
      this.a_uv    = gl.getAttribLocation(prog, 'a_uv');
      this.a_color = gl.getAttribLocation(prog, 'a_color');
      this.a_fog   = gl.getAttribLocation(prog, 'a_fog');
      this.u_viewSize   = gl.getUniformLocation(prog, 'u_viewSize');
      this.u_tex        = gl.getUniformLocation(prog, 'u_tex');
      this.u_useTex     = gl.getUniformLocation(prog, 'u_useTex');
      this.u_roll       = gl.getUniformLocation(prog, 'u_roll');
      this.u_pivot      = gl.getUniformLocation(prog, 'u_pivot');
      this.u_fogEnabled = gl.getUniformLocation(prog, 'u_fogEnabled');
      this.u_fogColor   = gl.getUniformLocation(prog, 'u_fogColor');

      // streaming slab
      this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, 54*4, gl.DYNAMIC_DRAW); // 6 verts * 9 floats * 4B
      const stride = 9*4;
      gl.enableVertexAttribArray(this.a_pos);
      gl.vertexAttribPointer(this.a_pos,2,gl.FLOAT,false,stride,0);
      gl.enableVertexAttribArray(this.a_uv);
      gl.vertexAttribPointer(this.a_uv,2,gl.FLOAT,false,stride,2*4);
      gl.enableVertexAttribArray(this.a_color);
      gl.vertexAttribPointer(this.a_color,4,gl.FLOAT,false,stride,4*4);
      gl.enableVertexAttribArray(this.a_fog);
      gl.vertexAttribPointer(this.a_fog,1,gl.FLOAT,false,stride,8*4);

      this.slab = new Float32Array(54);

      gl.viewport(0,0,canvas.width,canvas.height);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(this.u_viewSize, canvas.width, canvas.height);
      gl.uniform1i(this.u_tex, 0);
      gl.uniform1i(this.u_useTex, 0);

      // fog uniforms (dirty-checked later)
      this._fogEnabled = null;
      this._fogColor = [NaN,NaN,NaN];

      this.whiteTex = this._makeWhiteTex();
    }
    _createShader(src, type){
      const gl=this.gl, sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)||'shader error');
      return sh;
    }
    _createProgram(vs, fs){
      const gl=this.gl, p=gl.createProgram();
      gl.attachShader(p, this._createShader(vs, gl.VERTEX_SHADER));
      gl.attachShader(p, this._createShader(fs, gl.FRAGMENT_SHADER));
      gl.linkProgram(p);
      if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)||'link error');
      return p;
    }
    _makeWhiteTex(){
      const gl=this.gl, t=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return t;
    }
    loadTexture(url){
      const gl=this.gl;
      return new Promise((resolve)=>{
        const img=new Image();
        img.crossOrigin = 'anonymous';
        img.onload=()=>{
          const t=gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D,t);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          resolve(t);
        };
        img.onerror=()=>resolve(null);
        img.src=url;
      });
    }
    begin(clear=[0.9,0.95,1.0,1]){
      const gl=this.gl;
      gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
      gl.clearColor(clear[0],clear[1],clear[2],clear[3]); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(this.u_pivot, gl.canvas.width*0.5, gl.canvas.height*0.82);
      // Fog uniforms only when changed
      const fogConfig = (window.Config && window.Config.fog) || { enabled: false, color: [0, 0, 0] };
      const en = fogConfig.enabled ? 1 : 0;
      if (this._fogEnabled !== en) { this._fogEnabled = en; gl.uniform1i(this.u_fogEnabled, en); }
      const [r = 0, g = 0, b = 0] = fogConfig.color || [];
      if (r!==this._fogColor[0] || g!==this._fogColor[1] || b!==this._fogColor[2]) {
        this._fogColor = [r,g,b];
        gl.uniform3f(this.u_fogColor, r, g, b);
      }
    }
    setRollPivot(rad, px, py){ const gl=this.gl; gl.uniform1f(this.u_roll, rad); gl.uniform2f(this.u_pivot, px, py); }
    drawQuadTextured(tex, quad, uv, tint=[1,1,1,1], fog=[0,0,0,0]){
      const v = this.slab;
      let i=0;
      // tri 1
      v[i++]=quad.x1; v[i++]=quad.y1; v[i++]=uv.u1; v[i++]=uv.v1; v[i++]=tint[0]; v[i++]=tint[1]; v[i++]=tint[2]; v[i++]=tint[3]; v[i++]=fog[0];
      v[i++]=quad.x2; v[i++]=quad.y2; v[i++]=uv.u2; v[i++]=uv.v2; v[i++]=tint[0]; v[i++]=tint[1]; v[i++]=tint[2]; v[i++]=tint[3]; v[i++]=fog[1];
      v[i++]=quad.x3; v[i++]=quad.y3; v[i++]=uv.u3; v[i++]=uv.v3; v[i++]=tint[0]; v[i++]=tint[1]; v[i++]=tint[2]; v[i++]=tint[3]; v[i++]=fog[2];
      // tri 2
      v[i++]=quad.x1; v[i++]=quad.y1; v[i++]=uv.u1; v[i++]=uv.v1; v[i++]=tint[0]; v[i++]=tint[1]; v[i++]=tint[2]; v[i++]=tint[3]; v[i++]=fog[0];
      v[i++]=quad.x3; v[i++]=quad.y3; v[i++]=uv.u3; v[i++]=uv.v3; v[i++]=tint[0]; v[i++]=tint[1]; v[i++]=tint[2]; v[i++]=tint[3]; v[i++]=fog[2];
      v[i++]=quad.x4; v[i++]=quad.y4; v[i++]=uv.u4; v[i++]=uv.v4; v[i++]=tint[0]; v[i++]=tint[1]; v[i++]=tint[2]; v[i++]=tint[3]; v[i++]=fog[3];
      const gl=this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex || this.whiteTex);
      gl.uniform1i(this.u_useTex, tex ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }
    drawQuadSolid(quad, color=[1,0,0,1], fog=[0,0,0,0]){
      const uv={u1:0,v1:0,u2:1,v2:0,u3:1,v3:1,u4:0,v4:1};
      this.drawQuadTextured(this.whiteTex, quad, uv, color, fog);
    }
    makeCircleTex(size=64){
      const cvs=document.createElement('canvas'); cvs.width=size; cvs.height=size;
      const ctx=cvs.getContext('2d');
      const cx=size/2, cy=size/2, r=size*0.45;
      const g=ctx.createRadialGradient(cx,cy,0, cx,cy,r);
      g.addColorStop(0.0,'rgba(255,255,255,1)');
      g.addColorStop(0.7,'rgba(255,255,255,1)');
      g.addColorStop(1.0,'rgba(255,255,255,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,size,size);
      const gl=this.gl, t=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cvs);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    end(){}
  }

  function padQuad(q, { padLeft=0, padRight=0, padTop=0, padBottom=0 } = {}) {
    // Returns a new quad with edges expanded in screen space. Positive padding values
    // enlarge the quad outward along each axis regardless of vertex winding/order.
    const xs = [q.x1, q.x2, q.x3, q.x4];
    const ys = [q.y1, q.y2, q.y3, q.y4];
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const adjustX = (x) => {
      const dMin = Math.abs(x - minX);
      const dMax = Math.abs(x - maxX);
      return x + (dMin <= dMax ? -padLeft : padRight);
    };
    const adjustY = (y) => {
      const dMin = Math.abs(y - minY);
      const dMax = Math.abs(y - maxY);
      return y + (dMin <= dMax ? -padTop : padBottom);
    };

    return {
      x1: adjustX(q.x1), y1: adjustY(q.y1),
      x2: adjustX(q.x2), y2: adjustY(q.y2),
      x3: adjustX(q.x3), y3: adjustY(q.y3),
      x4: adjustX(q.x4), y4: adjustY(q.y4),
    };
  }

  function makeRotatedQuad(cx, cy, w, h, rad){
    const c = Math.cos(rad), s = Math.sin(rad);
    const hw = w * 0.5, hh = h * 0.5;
    const x1=-hw, y1=-hh, x2= hw, y2=-hh, x3= hw, y3= hh, x4=-hw, y4= hh;
    const rx1 = c*x1 - s*y1 + cx, ry1 = s*x1 + c*y1 + cy;
    const rx2 = c*x2 - s*y2 + cx, ry2 = s*x2 + c*y2 + cy;
    const rx3 = c*x3 - s*y3 + cx, ry3 = s*x3 + c*y3 + cy;
    const rx4 = c*x4 - s*y4 + cx, ry4 = s*x4 + c*y4 + cy;
    return { x1:rx1, y1:ry1, x2:rx2, y2:ry2, x3:rx3, y3:ry3, x4:rx4, y4:ry4 };
  }

  window.RenderGL = { GLRenderer, padQuad, makeRotatedQuad };
  Object.freeze(window.RenderGL);
})();
