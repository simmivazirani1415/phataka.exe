import type { CrackerType } from '../../assets/AssetRegistry';

// A looping animation of the hand gesture that lights each cracker, played on the spotlight
// card like a GIF. Drawn with hand emoji moving over simple SVG guides: the fuse to touch,
// the circle to draw, the triangle to make, the string to swipe along. CSS does the motion
// (see .gdemo in global.css); each loop's last frame is the finished gesture, so with
// reduced motion the card shows the end pose with its guide fully drawn.

export function GestureDemo({ type }: { type: CrackerType }) {
  return (
    <div className={`gdemo gd-${type}`} aria-hidden="true">
      {type === 'bomb' && (
        <>
          <svg viewBox="0 0 150 110" className="gd-guide">
            <circle cx="104" cy="74" r="16" className="gd-ob" />
            <path d="M104 58 q4 -10 12 -14" className="gd-fuse" />
            <circle cx="116" cy="44" r="5" className="gd-spark" />
          </svg>
          <span className="gd-h gd-h1">🤏</span>
          <span className="gd-h gd-h2">🖐️</span>
        </>
      )}
      {type === 'rocket' && (
        <>
          <svg viewBox="0 0 150 110" className="gd-guide">
            <path d="M75 92 L75 20" className="gd-trail" />
            <path d="M60 30 L75 14 L90 30" className="gd-arrow" />
          </svg>
          <span className="gd-h gd-h1">✊</span>
          <span className="gd-h gd-h2">🖐️</span>
        </>
      )}
      {type === 'chakri' && (
        <>
          <svg viewBox="0 0 150 110" className="gd-guide">
            <circle cx="75" cy="55" r="32" className="gd-trail gd-circle" />
          </svg>
          <span className="gd-h gd-h1">☝️</span>
        </>
      )}
      {type === 'sparkler' && (
        <>
          <svg viewBox="0 0 150 110" className="gd-guide">
            <path d="M28 40 Q75 70 122 40" className="gd-trail gd-wave" />
          </svg>
          <span className="gd-h gd-h1">🤏</span>
          <span className="gd-sp">✨</span>
        </>
      )}
      {type === 'anaar' && (
        <>
          <svg viewBox="0 0 150 110" className="gd-guide">
            <path d="M75 26 L103 82 L47 82 Z" className="gd-trail gd-tri" />
          </svg>
          <span className="gd-h gd-h1">👉</span>
          <span className="gd-h gd-h2">👈</span>
        </>
      )}
      {type === 'ladi' && (
        <>
          <svg viewBox="0 0 150 110" className="gd-guide">
            <path d="M18 70 Q75 84 132 70" className="gd-string" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <circle key={i} cx={24 + i * 15} cy={72 + Math.sin((i / 7) * Math.PI) * 6} r="4" className="gd-pop" style={{ animationDelay: `${0.25 + i * 0.12}s` }} />
            ))}
          </svg>
          <span className="gd-h gd-h1">🖐️</span>
        </>
      )}
      {type === 'skyshot' && (
        <>
          <svg viewBox="0 0 150 110" className="gd-guide">
            <path d="M75 96 L75 22" className="gd-trail gd-shotpath" />
            {[0, 1, 2].map((i) => (
              <circle key={i} cx={52 + i * 23} cy={20 + (i % 2) * 8} r="4" className="gd-pop" style={{ animationDelay: `${0.9 + i * 0.2}s` }} />
            ))}
          </svg>
          <span className="gd-h gd-h1">🖐️</span>
        </>
      )}
      {type === 'popPop' && (
        <>
          <svg viewBox="0 0 150 110" className="gd-guide">
            <path d="M75 14 L75 80" className="gd-trail gd-drop" />
            <g className="gd-burst">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <line key={a} x1="75" y1="92" x2={75 + Math.cos((a * Math.PI) / 180) * 14} y2={92 + Math.sin((a * Math.PI) / 180) * 9} />
              ))}
            </g>
          </svg>
          <span className="gd-h gd-h1">✋</span>
        </>
      )}
    </div>
  );
}
