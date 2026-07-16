export default function Lightbox({ images, idx, setIdx, slotsRef, onClose }) {
  const n = images.length;

  function lbNav(delta) {
    setIdx((i) => (i + delta + n) % n);
    const slots = slotsRef.current;
    if (slots) {
      slots.style.transition = 'none';
      slots.style.transform = 'translateX(0)';
    }
  }

  return (
    <div className="lightbox show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="lb-close" aria-label="Close" onClick={onClose}>&times;</button>
      <button className="lb-arrow lb-prev" aria-label="Previous image" onClick={() => lbNav(-1)}>&lsaquo;</button>
      <img src={images[idx]} alt="" />
      <button className="lb-arrow lb-next" aria-label="Next image" onClick={() => lbNav(1)}>&rsaquo;</button>
    </div>
  );
}
