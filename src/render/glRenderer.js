import { FOG } from '../config.js';

// Lightweight WebGL helper responsible for streaming quads.
export class GLRenderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
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
    this.a_pos = gl.getAttribLocation(prog, 'a_pos');
    this.a_uv = gl.getAttribLocation(prog, 'a_uv');
    this.a_color = gl.getAttribLocation(prog, 'a_color');
    this.a_fog = gl.getAttribLocation(prog, 'a_fog');
    this.u_viewSize = gl.getUniformLocation(prog, 'u_viewSize');
    this.u_tex = gl.getUniformLocation(prog, 'u_tex');
    this.u_useTex = gl.getUniformLocation(prog, 'u_useTex');
    this.u_roll = gl.getUniformLocation(prog, 'u_roll');
    this.u_pivot = gl.getUniformLocation(prog, 'u_pivot');
    this.u_fogEnabled = gl.getUniformLocation(prog, 'u_fogEnabled');
    this.u_fogColor = gl.getUniformLocation(prog, 'u_fogColor');

    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, 54 * 4, gl.DYNAMIC_DRAW);
    const stride = 9 * 4;
    gl.enableVertexAttribArray(this.a_pos);
    gl.vertexAttribPointer(this.a_pos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.a_uv);
    gl.vertexAttribPointer(this.a_uv, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(this.a_color);
    gl.vertexAttribPointer(this.a_color, 4, gl.FLOAT, false, stride, 4 * 4);
    gl.enableVertexAttribArray(this.a_fog);
    gl.vertexAttribPointer(this.a_fog, 1, gl.FLOAT, false, stride, 8 * 4);

    this.slab = new Float32Array(54);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.u_viewSize, canvas.width, canvas.height);
    gl.uniform1i(this.u_tex, 0);
    gl.uniform1i(this.u_useTex, 0);

    this._fogEnabled = null;
    this._fogColor = [NaN, NaN, NaN];
    this.whiteTex = this._makeWhiteTex();
  }

  _createShader(src, type) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'shader error');
    }
    return shader;
  }

  _createProgram(vs, fs) {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, this._createShader(vs, gl.VERTEX_SHADER));
    gl.attachShader(prog, this._createShader(fs, gl.FRAGMENT_SHADER));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'link error');
    }
    return prog;
  }

  _makeWhiteTex() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  loadTexture(url) {
    const gl = this.gl;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        resolve(tex);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  begin(clear = [0.9, 0.95, 1.0, 1]) {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.u_pivot, gl.canvas.width * 0.5, gl.canvas.height * 0.82);

    const fogEnabled = FOG.enabled ? 1 : 0;
    if (this._fogEnabled !== fogEnabled) {
      this._fogEnabled = fogEnabled;
      gl.uniform1i(this.u_fogEnabled, fogEnabled);
    }
    const [r, g, b] = FOG.color;
    if (r !== this._fogColor[0] || g !== this._fogColor[1] || b !== this._fogColor[2]) {
      this._fogColor = [r, g, b];
      gl.uniform3f(this.u_fogColor, r, g, b);
    }
  }

  setRollPivot(rad, px, py) {
    const gl = this.gl;
    gl.uniform1f(this.u_roll, rad);
    gl.uniform2f(this.u_pivot, px, py);
  }

  drawQuadTextured(tex, quad, uv, tint = [1, 1, 1, 1], fog = [0, 0, 0, 0]) {
    const v = this.slab;
    let i = 0;
    const push = (x, y, u, vv, r, g, b, a, f) => {
      v[i++] = x; v[i++] = y; v[i++] = u; v[i++] = vv;
      v[i++] = r; v[i++] = g; v[i++] = b; v[i++] = a;
      v[i++] = f;
    };
    push(quad.x1, quad.y1, uv.u1, uv.v1, ...tint, fog[0]);
    push(quad.x2, quad.y2, uv.u2, uv.v2, ...tint, fog[1]);
    push(quad.x3, quad.y3, uv.u3, uv.v3, ...tint, fog[2]);
    push(quad.x1, quad.y1, uv.u1, uv.v1, ...tint, fog[0]);
    push(quad.x3, quad.y3, uv.u3, uv.v3, ...tint, fog[2]);
    push(quad.x4, quad.y4, uv.u4, uv.v4, ...tint, fog[3]);

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex || this.whiteTex);
    gl.uniform1i(this.u_useTex, tex ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  drawQuadSolid(quad, color = [1, 0, 0, 1], fog = [0, 0, 0, 0]) {
    const uv = { u1: 0, v1: 0, u2: 1, v2: 0, u3: 1, v3: 1, u4: 0, v4: 1 };
    this.drawQuadTextured(this.whiteTex, quad, uv, color, fog);
  }

  makeCircleTex(size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.45;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,1)');
    gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  end() {}
}
