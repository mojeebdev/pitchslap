import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export default function Logo({ className = '', size = 42 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 42 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PitchSlap"
    >
      <text
        x="21"
        y="32"
        textAnchor="middle"
        fontSize="38"
        fontFamily="EB Garamond, Georgia, serif"
        fontStyle="italic"
        fontWeight="700"
        fill="#ff3434"
        letterSpacing="-1.5"
      >
        PS
      </text>
    </svg>
  );
}
