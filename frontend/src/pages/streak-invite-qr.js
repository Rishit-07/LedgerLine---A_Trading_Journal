import QRCode from 'qrcode';

const badgeSize = 11;
const errorCorrectionLevel = 'Q';

function badgePosition(modules) {
  const start = (modules.size - badgeSize) / 2;
  for (let row = start; row < start + badgeSize; row++) {
    for (let column = start; column < start + badgeSize; column++) {
      if (modules.isReserved(row, column)) return null;
    }
  }
  return start;
}

export async function drawInviteQr(canvas, link) {
  let code = QRCode.create(link, { errorCorrectionLevel });
  let badgeStart = badgePosition(code.modules);
  // A larger symbol can move alignment patterns away from the center badge.
  while (badgeStart === null && code.version < 40) {
    code = QRCode.create(link, { version: code.version + 1, errorCorrectionLevel });
    badgeStart = badgePosition(code.modules);
  }
  const { modules } = code;
  const { size } = modules;
  const moduleSize = 10;
  const quietZone = 4;
  const eyes = [[0, 0], [0, size - 7], [size - 7, 0]];
  canvas.width = canvas.height = (size + quietZone * 2) * moduleSize;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(quietZone * moduleSize, quietZone * moduleSize);
  context.fillStyle = '#171724';

  function drawSquare(row, column, width, radius) {
    context.beginPath();
    const side = width * moduleSize;
    context.roundRect(column * moduleSize, row * moduleSize, side, side, radius * moduleSize);
    context.fill();
  }

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const inEye = eyes.some(([y, x]) => row >= y && row < y + 7 && column >= x && column < x + 7);
      if (!inEye && modules.get(row, column)) {
        drawSquare(row, column, 1, modules.isReserved(row, column) ? 0 : 0.35);
      }
    }
  }

  for (const [row, column] of eyes) {
    drawSquare(row, column, 7, 0.7);
    context.fillStyle = '#fff';
    drawSquare(row + 1, column + 1, 5, 0.45);
    context.fillStyle = '#171724';
    drawSquare(row + 2, column + 2, 3, 0.3);
  }

  if (badgeStart === null) return;
  const icon = new Image();
  icon.src = '/ledgerline-icon.svg';
  try {
    await icon.decode();
  } catch {
    return;
  }
  context.fillStyle = '#fff';
  drawSquare(badgeStart, badgeStart, badgeSize, 1.25);
  const iconStart = (badgeStart + 1) * moduleSize;
  const iconSide = (badgeSize - 2) * moduleSize;
  context.drawImage(icon, iconStart, iconStart, iconSide, iconSide);
}
