# Lola Redes

Especialista independiente de DoingLio para comunicación y redes sociales.

- Proyecto padre: DoingLio
- Especialista: Lola Redes
- Versionado propio: L1, L2, L3...
- Web: https://duiliomf.github.io/lola-redes/
- Regreso: https://duiliomf.github.io/doinglio/

La identidad de acceso sigue usando el servicio central de DoingLio; el código y la publicación de Lola viven en este repositorio.

## Conectar Instagram

Lola usa el acceso oficial **Instagram Login** de Meta; no utiliza servicios intermediarios. La primera prueba requiere una cuenta profesional de Instagram (Empresa o Creador) y una app de Meta configurada para Instagram Login.

En Supabase Edge Function Secrets se deben cargar `META_APP_ID` y `META_APP_SECRET`. En la configuración de la app de Meta, registrar como OAuth redirect URI:

`https://apqgrwudkfytwikrsivd.supabase.co/functions/v1/lola-instagram-oauth`

Habilitar los permisos `instagram_business_basic` e `instagram_business_content_publish`. Los tokens se guardan en una tabla protegida con RLS y nunca se devuelven al navegador. La cuenta conectada se muestra en Lola Redes.

