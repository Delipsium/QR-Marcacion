/**
 * Generador local de códigos QR (ISO/IEC 18004, Modo Byte, Corrección M, Versiones 1–11).
 * Cero dependencias externas: funciona sin internet y desde archivos locales.
 */
(function (global) {
  "use strict";

  // Tabla por versión (1..11) para nivel de corrección M:
  // [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data, alignCoords]
  const VERSION_TABLE_M = {
    1:  [10, 1, 16, 0,  0, []],
    2:  [16, 1, 28, 0,  0, [6, 18]],
    3:  [26, 1, 44, 0,  0, [6, 22]],
    4:  [18, 2, 32, 0,  0, [6, 26]],
    5:  [24, 2, 43, 0,  0, [6, 30]],
    6:  [16, 4, 27, 0,  0, [6, 34]],
    7:  [18, 4, 31, 0,  0, [6, 22, 38]],
    8:  [22, 2, 38, 2, 39, [6, 24, 42]],
    9:  [22, 3, 36, 2, 37, [6, 26, 46]],
    10: [26, 4, 43, 1, 44, [6, 28, 50]],
    11: [30, 1, 50, 4, 51, [6, 30, 54]]
  };

  // Tablas GF(256) con polinomio primitivo 0x11D
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const res = new Uint8Array(data.length + ecCount);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") {
      return Array.from(new TextEncoder().encode(str));
    }
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return bytes;
  }

  function selectVersion(byteLength) {
    for (let v = 1; v <= 11; v++) {
      const [, g1B, g1D, g2B, g2D] = VERSION_TABLE_M[v];
      const totalDataBytes = g1B * g1D + g2B * g2D;
      const charCountBits = v <= 9 ? 8 : 16;
      const maxBytes = Math.floor((totalDataBytes * 8 - 4 - charCountBits) / 8);
      if (byteLength <= maxBytes) return v;
    }
    throw new Error("El texto/URL es demasiado largo para este generador QR.");
  }

  function encodeData(bytes, version) {
    const [ecLen, g1B, g1D, g2B, g2D] = VERSION_TABLE_M[version];
    const totalDataCodewords = g1B * g1D + g2B * g2D;
    const bits = [];

    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >>> i) & 1);
      }
    }

    // Modo Byte: 0100
    pushBits(0b0100, 4);
    // Longitud del mensaje
    pushBits(bytes.length, version <= 9 ? 8 : 16);
    for (const b of bytes) pushBits(b, 8);

    // Terminador (hasta 4 ceros)
    const maxBits = totalDataCodewords * 8;
    const termLen = Math.min(4, maxBits - bits.length);
    for (let i = 0; i < termLen; i++) bits.push(0);

    // Alinear a byte
    while (bits.length % 8 !== 0) bits.push(0);

    // Relleno alternado 0xEC / 0x11
    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      dataCodewords.push(byte);
    }
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (dataCodewords.length < totalDataCodewords) {
      dataCodewords.push(padBytes[padIdx++ % 2]);
    }

    // Dividir en bloques y calcular Reed-Solomon
    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;

    for (let i = 0; i < g1B; i++) {
      const block = dataCodewords.slice(offset, offset + g1D);
      offset += g1D;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecLen));
    }
    for (let i = 0; i < g2B; i++) {
      const block = dataCodewords.slice(offset, offset + g2D);
      offset += g2D;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecLen));
    }

    // Intercalar bloques de datos y luego bloques EC
    const finalBytes = [];
    const maxDataLen = Math.max(g1D, g2D);
    for (let i = 0; i < maxDataLen; i++) {
      for (const blk of dataBlocks) {
        if (i < blk.length) finalBytes.push(blk[i]);
      }
    }
    for (let i = 0; i < ecLen; i++) {
      for (const ec of ecBlocks) {
        finalBytes.push(ec[i]);
      }
    }

    return finalBytes;
  }

  function createMatrix(version) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const isFunction = Array.from({ length: size }, () => new Uint8Array(size));

    function setFunc(r, c, val) {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      modules[r][c] = val ? 1 : 0;
      isFunction[r][c] = 1;
    }

    function drawFinder(top, left) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = top + dr;
          const c = left + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const onBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
          const inOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setFunc(r, c, !onBorder && (inOuter || inInner));
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Patrones de alineación
    const coords = VERSION_TABLE_M[version][5];
    for (const rCenter of coords) {
      for (const cCenter of coords) {
        if (
          (rCenter <= 8 && cCenter <= 8) ||
          (rCenter <= 8 && cCenter >= size - 9) ||
          (rCenter >= size - 9 && cCenter <= 8)
        ) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dist = Math.max(Math.abs(dr), Math.abs(dc));
            setFunc(rCenter + dr, cCenter + dc, dist === 2 || dist === 0);
          }
        }
      }
    }

    // Patrones de sincronización (timing)
    for (let i = 8; i < size - 8; i++) {
      const bit = i % 2 === 0;
      if (!isFunction[6][i]) setFunc(6, i, bit);
      if (!isFunction[i][6]) setFunc(i, 6, bit);
    }

    // Módulo oscuro obligatorio
    setFunc(4 * version + 9, 8, true);

    // Reservar áreas de formato
    for (let i = 0; i <= 8; i++) {
      if (!isFunction[8][i]) setFunc(8, i, false);
      if (!isFunction[i][8]) setFunc(i, 8, false);
      if (i < 8) {
        if (!isFunction[8][size - 1 - i]) setFunc(8, size - 1 - i, false);
        if (!isFunction[size - 1 - i][8]) setFunc(size - 1 - i, 8, false);
      }
    }

    // Información de versión para V >= 7
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) {
        rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      }
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFunc(a, b, bit);
        setFunc(b, a, bit);
      }
    }

    return { size, modules, isFunction };
  }

  function placeData(matrix, codewords) {
    const { size, modules, isFunction } = matrix;
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let up = true;

    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        const r = up ? size - 1 - vert : vert;
        for (let lr = 0; lr < 2; lr++) {
          const c = right - lr;
          if (!isFunction[r][c]) {
            let bit = 0;
            if (bitIdx < totalBits) {
              const byte = codewords[bitIdx >>> 3];
              bit = (byte >>> (7 - (bitIdx & 7))) & 1;
              bitIdx++;
            }
            modules[r][c] = bit;
          }
        }
      }
      up = !up;
    }
  }

  function maskCondition(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  }

  function writeFormatBits(modules, size, mask) {
    // EC Level M = 00
    const data = (0b00 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;

    // Primera copia (alrededor del detector superior izquierdo)
    for (let i = 0; i <= 5; i++) modules[i][8] = (bits >>> i) & 1;
    modules[7][8] = (bits >>> 6) & 1;
    modules[8][8] = (bits >>> 7) & 1;
    modules[8][7] = (bits >>> 8) & 1;
    for (let i = 9; i < 15; i++) modules[8][14 - i] = (bits >>> i) & 1;

    // Segunda copia (superior derecho e inferior izquierdo)
    for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = (bits >>> i) & 1;
    for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = (bits >>> i) & 1;
  }

  function computePenalty(modules, size) {
    let penalty = 0;

    // N1: 5+ módulos iguales consecutivos en fila o columna
    for (let r = 0; r < size; r++) {
      let runColor = modules[r][0];
      let runLen = 1;
      for (let c = 1; c < size; c++) {
        if (modules[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }

    for (let c = 0; c < size; c++) {
      let runColor = modules[0][c];
      let runLen = 1;
      for (let r = 1; r < size; r++) {
        if (modules[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }

    // N2: bloques 2x2
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = modules[r][c];
        if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
          penalty += 3;
        }
      }
    }

    // N3: patrón 1011101 con 4 blancos antes o después
    const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c <= size - 11; c++) {
        let m1 = true, m2 = true;
        for (let k = 0; k < 11; k++) {
          if (modules[r][c + k] !== pat1[k]) m1 = false;
          if (modules[r][c + k] !== pat2[k]) m2 = false;
        }
        if (m1) penalty += 40;
        if (m2) penalty += 40;
      }
    }
    for (let c = 0; c < size; c++) {
      for (let r = 0; r <= size - 11; r++) {
        let m1 = true, m2 = true;
        for (let k = 0; k < 11; k++) {
          if (modules[r + k][c] !== pat1[k]) m1 = false;
          if (modules[r + k][c] !== pat2[k]) m2 = false;
        }
        if (m1) penalty += 40;
        if (m2) penalty += 40;
      }
    }

    // N4: proporción de módulos oscuros
    let dark = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (modules[r][c] === 1) dark++;
      }
    }
    const percent = (dark * 100) / (size * size);
    const k = Math.floor(Math.abs(percent - 50) / 5);
    penalty += k * 10;

    return penalty;
  }

  function applyBestMask(matrix) {
    const { size, modules, isFunction } = matrix;
    let bestMask = 0;
    let bestScore = Infinity;
    let bestModules = null;

    for (let mask = 0; mask < 8; mask++) {
      const candidate = modules.map((row) => new Int8Array(row));
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!isFunction[r][c] && maskCondition(mask, r, c)) {
            candidate[r][c] ^= 1;
          }
        }
      }
      writeFormatBits(candidate, size, mask);
      const score = computePenalty(candidate, size);
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
        bestModules = candidate;
      }
    }

    matrix.modules = bestModules;
    matrix.mask = bestMask;
  }

  function createQRMatrix(text) {
    const bytes = utf8Bytes(String(text));
    const version = selectVersion(bytes.length);
    const codewords = encodeData(bytes, version);
    const matrix = createMatrix(version);
    placeData(matrix, codewords);
    applyBestMask(matrix);
    return {
      version,
      size: matrix.size,
      modules: matrix.modules
    };
  }

  function drawToCanvas(canvas, text, options = {}) {
    const targetWidth = options.width || 280;
    const quietZone = options.margin ?? 4;
    const qr = createQRMatrix(text);
    const totalModules = qr.size + quietZone * 2;
    const scale = Math.max(2, Math.floor(targetWidth / totalModules));
    const finalSize = totalModules * scale;

    canvas.width = finalSize;
    canvas.height = finalSize;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, finalSize, finalSize);

    ctx.fillStyle = "#000000";
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.modules[r][c] === 1) {
          ctx.fillRect((c + quietZone) * scale, (r + quietZone) * scale, scale, scale);
        }
      }
    }
    return qr;
  }

  global.LocalQRCode = {
    createMatrix: createQRMatrix,
    drawToCanvas: drawToCanvas
  };
})(typeof window !== "undefined" ? window : globalThis);
