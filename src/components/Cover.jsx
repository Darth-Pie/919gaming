import { Sigil } from '../lib/icons.jsx';

export default function Cover({ book }) {
  const texture = book.spine.texture || 'leather';
  return (
    <div className="cover">
      <div className={'cover-face tex-' + texture} style={{ background: book.cover }}>
        <Sigil />
        <h2 className="cover-title">{book.title}</h2>
      </div>
    </div>
  );
}
