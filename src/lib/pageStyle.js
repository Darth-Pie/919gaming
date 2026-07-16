export function pageClassName(side, b) {
  return 'page ' + side + (b.pageTexture ? ' tex-page-' + b.pageTexture : '');
}

export function pageVarsStyle(b) {
  return b.bodyColor ? { '--ink': b.bodyColor } : undefined;
}

export function headerStyleObj(b) {
  return { color: b.headerColor, fontFamily: b.titleFont };
}

export function bodyTextStyleObj(b) {
  return { fontFamily: b.bodyFont };
}
