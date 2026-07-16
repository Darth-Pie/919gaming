export function Star() {
  return (
    <svg width="24" height="24" viewBox="0 0 60 60" fill="none">
      <path d="M30 6 L34 26 L54 30 L34 34 L30 54 L26 34 L6 30 L26 26 Z" fill="#ecd8a4" />
    </svg>
  );
}

export function Sigil() {
  return (
    <svg width="96" height="96" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="54" stroke="#c9a96a" strokeWidth="2" opacity="0.75" />
      <circle cx="60" cy="60" r="42" stroke="#c9a96a" strokeWidth="1" opacity="0.45" />
      <path d="M60 12 L67 52 L107 60 L67 68 L60 108 L53 68 L13 60 L53 52 Z" stroke="#ecd8a4" strokeWidth="1.6" fill="none" />
      <circle cx="60" cy="60" r="5" fill="#c9a96a" />
    </svg>
  );
}

export function SpineSeal({ path }) {
  return (
    <span className="spine-seal">
      <img src={path} alt="seal" />
    </span>
  );
}

export function Emblem({ spine }) {
  if (spine.emblem === 'orchid') {
    return (
      <svg width="22" height="22" viewBox="0 0 60 60" fill="none">
        <path d="M30 8 C36 20 48 22 48 34 C48 44 40 52 30 52 C20 52 12 44 12 34 C12 22 24 20 30 8 Z" fill={spine.accent} stroke="#5a4418" strokeWidth="1.4" />
        <circle cx="30" cy="34" r="5" fill="#7c1f1f" />
      </svg>
    );
  }
  if (spine.emblem === 'whale') {
    return (
      <svg width="26" height="18" viewBox="0 0 60 40" fill="none">
        <path d="M30 3 C24 12 10 15 3 28 C12 24 21 23 28 29 C23 19 27 10 30 3 Z M30 3 C36 12 50 15 57 28 C48 24 39 23 32 29 C37 19 33 10 30 3 Z" fill={spine.accent} />
      </svg>
    );
  }
  return (
    <span className="emblem" style={{ border: '1.5px solid ' + spine.accent, color: spine.title }}>
      {spine.mark || ''}
    </span>
  );
}

export function LinkIcon({ name }) {
  if (name === 'discord') {
    return (
      <svg className="link-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.522 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189Zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
      </svg>
    );
  }
  if (name === 'raven') {
    return (
      <svg className="link-icon link-icon-raven" viewBox="0 7 24 12" fill="currentColor" aria-hidden="true">
        <path d="M2 16 C6 9 10 9 12 14 C14 9 18 9 22 16 C18 13.2 14.5 13.8 12 18 C9.5 13.8 6 13.2 2 16 Z" />
      </svg>
    );
  }
  return null;
}
