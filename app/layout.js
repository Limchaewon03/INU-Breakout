import "./globals.css";

export const metadata = {
  title: 'INU 벽돌깨기',
  description: '인천대학교 해양학과 임채원의 INU 벽돌깨기 웹 게임',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  );
}
