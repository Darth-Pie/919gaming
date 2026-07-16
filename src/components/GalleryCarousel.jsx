const GAL_SLIDE_MS = 800;

export default function GalleryCarousel({ images, idx, setIdx, slotsRef, onOpenLightbox }) {
  const n = images.length;

  function navigate(delta) {
    const slots = slotsRef.current;
    if (!slots) return;
    const vp = slots.parentElement;
    slots.style.transition = 'transform ' + GAL_SLIDE_MS + 'ms cubic-bezier(.22,.85,.34,1)';
    slots.style.transform = 'translateX(' + (-delta * vp.clientWidth * 0.5) + 'px)';
    setTimeout(() => {
      slots.style.transition = 'none';
      slots.style.transform = 'translateX(0)';
      void slots.offsetWidth; // force reflow so the next transition re-applies cleanly
      setIdx((i) => (i + delta + n) % n);
    }, GAL_SLIDE_MS);
  }

  function jumpTo(i) {
    if (i === idx) { onOpenLightbox(); return; }
    if ((idx + 1) % n === i) navigate(1);
    else if ((idx - 1 + n) % n === i) navigate(-1);
    else setIdx(i);
  }

  const lSrc = images[(idx - 1 + n) % n];
  const cSrc = images[idx];
  const rSrc = images[(idx + 1) % n];

  return (
    <>
      <div className="gallery">
        <button className="gal-arrow gal-prev" aria-label="Previous image" onClick={() => navigate(-1)}>&lsaquo;</button>
        <div className="gal-viewport">
          <div className="gal-slots" ref={slotsRef}>
            <div className="gal-slot slot-l">
              <div className="polaroid">
                <div className="photo-window"><img src={lSrc} alt="" onClick={() => navigate(-1)} /><span className="stamp">Evidence</span></div>
              </div>
            </div>
            <div className="gal-slot slot-c">
              <div className="polaroid">
                <div className="photo-window"><img src={cSrc} alt="" onClick={onOpenLightbox} /><span className="stamp">Evidence</span></div>
              </div>
            </div>
            <div className="gal-slot slot-r">
              <div className="polaroid">
                <div className="photo-window"><img src={rSrc} alt="" onClick={() => navigate(1)} /><span className="stamp">Evidence</span></div>
              </div>
            </div>
          </div>
        </div>
        <button className="gal-arrow gal-next" aria-label="Next image" onClick={() => navigate(1)}>&rsaquo;</button>
      </div>
      <div className="gal-dots">
        {images.map((_, i) => (
          <span key={i} className={'dot' + (i === idx ? ' active' : '')} onClick={() => jumpTo(i)} />
        ))}
      </div>
    </>
  );
}
