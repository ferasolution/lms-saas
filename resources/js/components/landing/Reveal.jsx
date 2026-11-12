import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';

const EASE = [0.2, 0.8, 0.2, 1];

/** Fades and lifts children into place once, when they scroll into view. */
export function Reveal({ children, delay = 0, y = 24, className = '', as = 'div' }) {
    const reduce = useReducedMotion();
    const M = motion[as];
    return (
        <M
            className={className}
            initial={reduce ? false : { opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, delay, ease: EASE }}
        >
            {children}
        </M>
    );
}

/** Headline whose lines slide up from behind a mask, one after another. */
export function MaskedLines({ lines, className = '', lineClassName = '', delay = 0.1 }) {
    const reduce = useReducedMotion();
    return (
        <span className={className}>
            {lines.map((line, i) => (
                <span key={i} className="block overflow-hidden pb-[0.08em]">
                    <motion.span
                        className={`block ${lineClassName}`}
                        initial={reduce ? false : { y: '110%' }}
                        animate={{ y: '0%' }}
                        transition={{ duration: 0.9, delay: delay + i * 0.12, ease: EASE }}
                    >
                        {line}
                    </motion.span>
                </span>
            ))}
        </span>
    );
}

/** Counts up to a number when it first appears. */
export function CountUp({ to, suffix = '', className = '' }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: '-40px' });
    const reduce = useReducedMotion();
    const value = useMotionValue(reduce ? to : 0);
    const text = useTransform(value, (v) => `${Math.round(v)}${suffix}`);

    useEffect(() => {
        if (!inView || reduce) return;
        const c = animate(value, to, { duration: 1.4, ease: EASE });
        return () => c.stop();
    }, [inView, reduce, to, value]);

    return <motion.span ref={ref} className={className}>{text}</motion.span>;
}

export { EASE };
