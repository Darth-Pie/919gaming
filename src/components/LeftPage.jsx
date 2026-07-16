import { pageClassName, pageVarsStyle, headerStyleObj, bodyTextStyleObj } from '../lib/pageStyle.js';
import GalleryCarousel from './GalleryCarousel.jsx';

export default function LeftPage({ book: b, galleryIdx, setGalleryIdx, slotsRef, onOpenLightbox }) {
  const hs = headerStyleObj(b);
  const bts = bodyTextStyleObj(b);

  return (
    <div className={pageClassName('left', b)} style={pageVarsStyle(b)}>
      <p className="chapter-label" style={hs}>{b.label}</p>
      <h2 className="chapter-title" style={hs}>{b.title}</h2>
      <p className="flavor" style={bts}>{b.flavor}</p>
      {b.leftImage && (
        <div className="log-image"><img src={b.leftImage} alt="" /></div>
      )}
      {b.gallery && (
        <GalleryCarousel
          images={b.gallery}
          idx={galleryIdx}
          setIdx={setGalleryIdx}
          slotsRef={slotsRef}
          onOpenLightbox={onOpenLightbox}
        />
      )}
    </div>
  );
}
