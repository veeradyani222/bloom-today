import React, { useEffect, useCallback, useState, useMemo } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';

export function ScrollPicker({ min, max, value, onChange }) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      axis: 'x',
      dragFree: false, /* Disabled dragFree so it firmly snaps to the numbers */
      containScroll: false,
      loop: false,
      startIndex: value - min,
      align: 'center'
    },
    [WheelGesturesPlugin({ forceWheelAxis: 'x' })]
  );

  const [internalValue, setInternalValue] = useState(value);

  const items = useMemo(() => {
    const arr = [];
    for (let i = min; i <= max; i++) arr.push(i);
    return arr;
  }, [min, max]);

  const onScroll = useCallback(() => {
    if (!emblaApi) return;
    
    // embla calculates the selected snap dynamically during scrolling
    const selectedIndex = emblaApi.selectedScrollSnap();
    const currentClosestVal = min + selectedIndex;

    if (currentClosestVal !== internalValue) {
      setInternalValue(currentClosestVal);
      onChange(currentClosestVal);
    }
  }, [emblaApi, min, internalValue, onChange]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onScroll);
    emblaApi.on('scroll', onScroll);
    onScroll();

    return () => {
      emblaApi.off('select', onScroll);
      emblaApi.off('scroll', onScroll);
    };
  }, [emblaApi, onScroll]);

  return (
    <div className="onb-number-scroll-container">
      <div className="onb-number-scroll-gradient left" />
      <div className="embla" ref={emblaRef}>
        <div className="embla__container">
          {items.map(num => (
            <button
              key={num}
              type="button"
              className={`onb-number-item ${num === internalValue ? 'selected' : ''} embla__slide`}
              onClick={() => { if (emblaApi) emblaApi.scrollTo(num - min); }}
            >
              {num}
            </button>
          ))}
        </div>
      </div>
      <div className="onb-number-scroll-gradient right" />
    </div>
  );
}
