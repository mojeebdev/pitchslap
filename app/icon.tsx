import { ImageResponse } from 'next/og';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0A0908',
          fontSize: 22,
          fontFamily: 'EB Garamond, Georgia, serif',
          fontStyle: 'italic',
          fontWeight: 700,
          color: '#ff3434',
          letterSpacing: '-1px',
        }}
      >
        PS
      </div>
    ),
    {
      ...size,
    }
  );
}
