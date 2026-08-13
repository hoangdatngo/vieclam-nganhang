/**
 * Home page — will become the aggregated job list (FR-10) in T-038, once the
 * crawler and the query builder exist.
 *
 * Until then this states plainly that there is no data, rather than showing a
 * fabricated list or a placeholder that implies the product works. Register per
 * §11.1: factual, no apology, sentence case, no exclamation marks.
 */
export default function Home() {
  return (
    <div className="mx-auto w-full max-w-list px-4 py-12 sm:px-6">
      <h1 className="text-xl font-semibold text-fg sm:text-2xl">Việc làm ngân hàng</h1>

      <p className="mt-4 max-w-prose text-base text-fg-secondary">
        Trang này tổng hợp tin tuyển dụng đang mở từ 13 ngân hàng thương mại Việt Nam, để bạn xem ở
        một nơi thay vì mở từng trang tuyển dụng riêng lẻ.
      </p>

      <p className="mt-3 max-w-prose text-base text-fg-muted">
        Hiện chưa có dữ liệu. Phần thu thập dữ liệu đang được xây dựng.
      </p>
    </div>
  );
}
