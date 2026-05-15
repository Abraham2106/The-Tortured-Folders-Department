import React, { useState, useRef, useCallback, useEffect } from 'react';
import styles from './ResizablePanels.module.css';

/**
 * A two-panel layout with a draggable divider.
 * @param {string} initialLeftPercent - Initial width of the left panel as a percentage (e.g. "60")
 * @param {number} minLeftPercent - Minimum left panel width percentage
 * @param {number} maxLeftPercent - Maximum left panel width percentage
 */
export const ResizablePanels = ({
  left,
  right,
  initialLeftPercent = 60,
  minLeftPercent = 25,
  maxLeftPercent = 80
}) => {
  const [leftWidth, setLeftWidth] = useState(initialLeftPercent);
  const containerRef = useRef(null);
  const isDragging = useRef(false);

  const onMouseMove = useCallback((e) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const newPercent = (offsetX / rect.width) * 100;
    const clamped = Math.min(maxLeftPercent, Math.max(minLeftPercent, newPercent));
    setLeftWidth(clamped);
  }, [minLeftPercent, maxLeftPercent]);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startDrag = () => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.panel} style={{ width: `${leftWidth}%` }}>
        {left}
      </div>
      <div
        className={styles.divider}
        onMouseDown={startDrag}
        title="Drag to resize"
      >
        <div className={styles.handle} />
      </div>
      <div className={styles.panel} style={{ width: `${100 - leftWidth}%` }}>
        {right}
      </div>
    </div>
  );
};
