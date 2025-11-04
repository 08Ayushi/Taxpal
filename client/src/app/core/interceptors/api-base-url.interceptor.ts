import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from 'src/environments/environment';

export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (/^https?:\/\//i.test(req.url)) return next(req); // already absolute
  const base = environment.API_URL.replace(/\/$/, '');
  const url  = `${base}${req.url}`;                    // base + "/api/..."
  return next(req.clone({ url }));
};
