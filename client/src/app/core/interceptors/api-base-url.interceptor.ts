import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

// Prefix any relative URL (e.g. "/api/v1/auth/login") with the API domain.
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  // already absolute? pass-through
  if (/^https?:\/\//i.test(req.url)) return next(req);

  const base = environment.API_URL.replace(/\/$/, ''); // strip trailing slash
  const url  = `${base}${req.url}`;                    // e.g. https://taxpal-5.onrender.com/api/v1/...
  return next(req.clone({ url }));
};
