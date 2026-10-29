import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const open = ["/", "/login", "/signup", "/demo", "/auth", "/access/", "/v/", "/r/", "/api/cron", "/api/capture", "/_next", "/favicon"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          }),
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const isOpen = path === "/" || open.slice(1).some((p) => path.startsWith(p));
  if (!data.user && !isOpen) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/((?!.*\\.(?:svg|png|jpe?g|webp|avif|gif|ico|woff2?)$).*)"] };
