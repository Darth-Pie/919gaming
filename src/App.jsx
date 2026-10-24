import { useEffect, useState } from 'react';
import Shelf from './components/Shelf.jsx';
import BookModal from './components/BookModal.jsx';
import { books } from './books.js';
import { bookIndexForHash } from './lib/hash.js';

export default function App() {
  const [openIndex, setOpenIndex] = useState(null);

  // 919gaming.com/#the-blooming opens that tome, on load and when the hash changes (a link on the page, the back button).
  useEffect(() => {
    const openFromHash = () => {
      const index = bookIndexForHash(books, window.location.hash);
      if (index !== null) setOpenIndex(index);
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  // Closing a tome clears the hash, so the same link opens it again.
  const close = () => {
    setOpenIndex(null);
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  return (
    <>
      <Shelf books={books} onSelect={setOpenIndex} />
      {openIndex !== null && (
        <BookModal book={books[openIndex]} onClose={close} />
      )}
    </>
  );
}
