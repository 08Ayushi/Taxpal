import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment'; // <-- 3x .. up to /src

// Prefix any *relative* URL (e.g., "/api/v1/...") with your Render API domain.
// Absolute URLs (http/https) are left unchanged.
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (/^https?:\/\//i.test(req.url)) {
    return next(req); // already absolute
  }
  const base = environment.API_URL.replace(/\/$/, ''); // strip trailing slash
  const url  = `${base}${req.url}`;                    // https://taxpal-5.onrender.com + /api/...
  return next(req.clone({ url }));
};
