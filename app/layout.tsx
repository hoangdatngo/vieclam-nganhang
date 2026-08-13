import type { Metadata } from "next";
import "./globals.css";

// Placeholder wording — the product name is not decided (PRD OQ-1, tasks.md T-059).
export const metadata: Metadata = {
  title: "Việc làm ngân hàng",
  description: "Tìm việc làm tại các ngân hàng Việt Nam ở một nơi duy nhất.",
};

/**
 * Application shell.
 *
 * No webfont is loaded, deliberately: the system stack already ships designed
 * Vietnamese glyphs, and a webfont is the largest avoidable cost against NFR-2's
 * 3-second budget on 4G (DESIGN_GUIDELINES §5.1, P5). The `create-next-app`
 * default pulled in two Geist families; both were removed.
 *
 * `lang="vi"` is mandatory — WCAG 3.1.1. It also drives Vietnamese screen-reader
 * pronunciation, font selection and line breaking (§8, §10.6).
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className="h-full">
      <body className="flex min-h-full flex-col">
        {/* First focusable element, visually hidden until focused. §10.6 */}
        <a
          href="#noi-dung"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded-md focus:border focus:border-border-control focus:bg-bg focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent"
        >
          Bỏ qua, tới danh sách việc làm
        </a>

        <header className="border-b border-border bg-bg">
          <div className="mx-auto w-full max-w-list px-4 py-4 sm:px-6">
            {/* Not an <h1>: each page owns its own single <h1> (§10.6). */}
            <span className="text-base font-semibold text-fg">Việc làm ngân hàng</span>
          </div>
        </header>

        <main id="noi-dung" className="flex-1">
          {children}
        </main>

        {/* Navigation to /pham-vi-du-lieu (T-045) and /ve-du-lieu (T-046) belongs
            here, and is deliberately absent until those routes exist — a footer
            link to a 404 is worse than no link. */}
        <footer className="mt-12 border-t border-border bg-bg">
          <div className="mx-auto w-full max-w-list px-4 py-6 sm:px-6">
            <p className="max-w-prose text-xs text-fg-muted">
              Dữ liệu được tổng hợp từ trang tuyển dụng công khai của các ngân hàng. Mỗi tin tuyển
              dụng đều dẫn về trang gốc của ngân hàng đó.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
