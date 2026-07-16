import { useState } from 'react';
import Shelf from './components/Shelf.jsx';
import BookModal from './components/BookModal.jsx';
import { books } from './books.js';

export default function App() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <>
      <Shelf books={books} onSelect={setOpenIndex} />
      {openIndex !== null && (
        <BookModal book={books[openIndex]} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
}
