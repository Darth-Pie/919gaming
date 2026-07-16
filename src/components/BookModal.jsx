import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import LeftPage from './LeftPage.jsx';
import RightPage from './RightPage.jsx';
import Cover from './Cover.jsx';
import Lightbox from './Lightbox.jsx';

export default function BookModal({ book, onClose }) {
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const slotsRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (lightboxOpen) setLightboxOpen(false);
      else onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen, onClose]);

  return createPortal(
    <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="book">
        <button className="close" aria-label="Close" onClick={onClose}>&times;</button>
        <div className="spread">
          <LeftPage
            book={book}
            galleryIdx={galleryIdx}
            setGalleryIdx={setGalleryIdx}
            slotsRef={slotsRef}
            onOpenLightbox={() => setLightboxOpen(true)}
          />
          <RightPage book={book} />
          <Cover book={book} />
        </div>
      </div>
      {lightboxOpen && book.gallery && createPortal(
        <Lightbox
          images={book.gallery}
          idx={galleryIdx}
          setIdx={setGalleryIdx}
          slotsRef={slotsRef}
          onClose={() => setLightboxOpen(false)}
        />,
        document.body
      )}
    </div>,
    document.body
  );
}
