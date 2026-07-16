import { Star, Emblem, SpineSeal } from '../lib/icons.jsx';

export default function Spine({ book, onSelect }) {
  const s = book.spine;
  const topIcon = (s.emblem === 'orchid' || s.emblem === 'whale') ? <Emblem spine={s} /> : <Star />;
  const bottomEmblem = s.seal ? <SpineSeal path={s.seal} /> : <Emblem spine={s} />;

  return (
    <div
      className={'spine tex-' + (s.texture || 'leather')}
      role="button"
      tabIndex={0}
      aria-label={'Open ' + book.title}
      style={{ height: (s.height || 312) + 'px', background: s.grad, '--band': s.band, '--glow': s.glow }}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    >
      <div className="band"></div>
      {topIcon}
      <div className="spine-title" style={{ color: s.title }}>{book.title}</div>
      {bottomEmblem}
      <div className="band"></div>
    </div>
  );
}
