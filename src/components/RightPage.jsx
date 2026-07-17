import { pageClassName, pageVarsStyle, headerStyleObj, bodyTextStyleObj } from '../lib/pageStyle.js';
import { LinkIcon } from '../lib/icons.jsx';

export default function RightPage({ book: b }) {
  const hs = headerStyleObj(b);
  const bts = bodyTextStyleObj(b);
  const className = pageClassName('right', b);
  const style = pageVarsStyle(b);

  if (b.kind === 'journal') {
    return (
      <div className={className} style={style}>
        <p className="chapter-label" style={hs}>The Fellowship</p>
        <h3 className="chapter-title sm" style={hs}>Find Me in the Wild</h3>
        <div className="links">
          {b.links.map((l) => (
            <a key={l.url} href={l.url}>
              <span><LinkIcon name={l.icon} />{l.name}</span>
              <span className="arrow">&rarr;</span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  if (b.kind === 'link') {
    return (
      <div className={className} style={style}>
        <p className="chapter-label" style={hs}>The Muster</p>
        <h3 className="chapter-title sm" style={hs}>Answer the Call</h3>
        <p className="desc" style={bts}>{b.description}</p>
        <div className="seal-wrap">
          <a className="badge" href={b.url} target="_blank" rel="noopener" aria-label={'Visit ' + b.title}>
            <img src={b.spine.seal} alt={b.title} />
          </a>
          <p className="seal-label">Join the Fleet</p>
          <p className="seal-host">{b.host}</p>
        </div>
      </div>
    );
  }

  // 'project': description + an "enter" seal. No custom sealImage + no badge override
  // means the tome gets the shared tintable wax seal (colored per-book via spine.accent)
  // instead of a generic photo.
  const sealSize = b.sealSize || 200;
  const useTintedWax = !b.sealImage && b.sealShape !== 'badge';
  const sealImg = b.sealImage || 'assets/sandstone.webp';

  return (
    <div className={className} style={style}>
      <p className="chapter-label" style={hs}>{b.pageLabel || 'The Tale'}</p>
      <h3 className="chapter-title sm" style={hs}>{b.pageTitle || 'Of This Realm'}</h3>
      <p className="desc" style={bts}>{b.description}</p>
      <div className="seal-wrap">
        {b.sealShape === 'badge' ? (
          <a className="badge" href={b.url} target="_blank" rel="noopener" aria-label="Enter this realm">
            <img src={sealImg} alt={b.title} />
          </a>
        ) : useTintedWax ? (
          <a className="seal wax-tinted" style={{ width: sealSize + 'px', height: sealSize + 'px' }} href={b.url} target="_blank" rel="noopener" aria-label="Enter this realm">
            <span className="wax-tinted-bg" style={{ '--seal-tint': b.spine.accent || '#7c1f1f' }} />
            <img className="wax-tinted-texture" src="/assets/waxseal.webp" alt="seal" />
          </a>
        ) : (
          <a className="seal" style={{ width: sealSize + 'px', height: sealSize + 'px' }} href={b.url} target="_blank" rel="noopener" aria-label="Enter this realm">
            <img src={sealImg} width={sealSize} height={sealSize} alt="seal" />
          </a>
        )}
        <p className="seal-label">{b.ctaText || 'Break the Seal to Enter'}</p>
        <p className="seal-host">{b.host}</p>
      </div>
    </div>
  );
}
