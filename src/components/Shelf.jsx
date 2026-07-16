import Spine from './Spine.jsx';

export default function Shelf({ books, onSelect }) {
  return (
    <div className="shelf">
      {books.map((b, i) => (
        <Spine key={b.title} book={b} onSelect={() => onSelect(i)} />
      ))}
      <div className="ghost" title="Room for more realms">
        <span>More realms to come</span>
      </div>
    </div>
  );
}
