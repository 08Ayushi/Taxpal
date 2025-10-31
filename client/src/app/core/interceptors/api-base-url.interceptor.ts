import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment'; // note the path

// Prefix any *relative* URL with your API domain.
// Absolute URLs (http/https) pass through untouched.
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (/^https?:\/\//i.test(req.url)) {
    return next(req); // already absolute
  }
  const base = environment.API_URL.replace(/\/$/, ''); // strip trailing slash
  const url  = `${base}${req.url}`;                    // e.g. https://taxpal-5.onrender.com/api/v1/...
  return next(req.clone({ url }));
};
