import { Sigil } from '../lib/icons.jsx';

export default function Cover({ book }) {
  return (
    <div className="cover">
      <div className="cover-face" style={{ background: book.cover }}>
        <Sigil />
        <h2 className="cover-title">{book.title}</h2>
      </div>
    </div>
  );
}
