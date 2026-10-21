import type { CSSProperties } from 'react';

export type SkeletonVariant = 'library' | 'review' | 'detail' | 'panels';

// Fast loads (most of them) finish before this, so they never flash a skeleton.
const SHOW_AFTER_MS = 150;

const Bar = ({ w, h = 12, style }: { w: string; h?: number; style?: CSSProperties }) => (
  <div className="sk" style={{ width: w, height: h, ...style }} />
);

/**
 * Placeholder in the shape of the page that's loading. Its fade-in is delayed by what's
 * left of SHOW_AFTER_MS since navigation, so it continues seamlessly from the static
 * skeleton in index.html when that one is already showing.
 */
export function PageSkeleton({ variant }: { variant: SkeletonVariant }) {
  const delay = Math.max(0, SHOW_AFTER_MS - performance.now());
  return (
    <div className="sk-page" style={{ animationDelay: `${delay}ms` }} role="status" aria-label="Loading">
      {variant === 'library' && (
        <>
          <div className="sk-tiles">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sk-tile">
                <Bar w="36px" h={22} />
                <Bar w="70%" h={10} />
              </div>
            ))}
          </div>
          <Bar w="100%" h={34} style={{ borderRadius: 8 }} />
          <div className="sk-row-gap" />
          {[64, 48, 72, 56, 40, 60].map((w, i) => (
            <div key={i} className="sk-row">
              <Bar w={`${w}%`} />
              <Bar w="52px" h={18} style={{ borderRadius: 999 }} />
            </div>
          ))}
        </>
      )}
      {variant === 'review' && (
        <>
          <Bar w="100%" h={4} />
          <div className="sk-row-gap" />
          <Bar w="38%" h={10} />
          <Bar w="62%" h={26} style={{ margin: '12px 0' }} />
          <Bar w="56px" h={18} style={{ borderRadius: 999 }} />
          <SkPanel lines={[100, 92, 70]} />
          <SkPanel lines={[45, 80, 75, 60]} tall />
        </>
      )}
      {variant === 'detail' && (
        <>
          <Bar w="70px" h={10} />
          <Bar w="55%" h={26} style={{ margin: '14px 0 10px' }} />
          <div className="sk-inline">
            <Bar w="56px" h={18} style={{ borderRadius: 999 }} />
            <Bar w="80px" h={18} style={{ borderRadius: 999 }} />
          </div>
          <div className="sk-tiles sk-tiles-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="sk-tile sk-tile-small">
                <Bar w="60%" h={9} />
                <Bar w="40%" h={14} />
              </div>
            ))}
          </div>
          <SkPanel lines={[90, 60]} />
          <SkPanel lines={[40, 85, 80, 70, 50]} tall />
        </>
      )}
      {variant === 'panels' && (
        <>
          <Bar w="30%" h={26} style={{ marginBottom: 6 }} />
          <SkPanel lines={[25, 90, 80]} />
          <SkPanel lines={[25, 70]} />
          <SkPanel lines={[25, 85, 60]} />
        </>
      )}
    </div>
  );
}

function SkPanel({ lines, tall }: { lines: number[]; tall?: boolean }) {
  return (
    <div className={`sk-panel${tall ? ' sk-panel-tall' : ''}`}>
      {lines.map((w, i) => (
        <Bar key={i} w={`${w}%`} h={i === 0 ? 10 : 12} />
      ))}
    </div>
  );
}
