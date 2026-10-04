# Lola Redes

Especialista independiente de DoingLio para comunicación y redes sociales.

- Proyecto padre: DoingLio
- Especialista: Lola Redes
- Versionado propio: L1, L2, L3...
- Web: https://duiliomf.github.io/lola-redes/
- Regreso: https://duiliomf.github.io/doinglio/

La identidad de acceso sigue usando el servicio central de DoingLio; el código y la publicación de Lola viven en este repositorio.

## Conectar Instagram

Lola usa el acceso oficial **Instagram Login** de Meta; no utiliza servicios intermediarios. La persona usuaria crea o conecta su cuenta desde Lola, que la guía con pasos simples. Para publicar necesita una cuenta profesional de Instagram (Empresa o Creador).

La configuración de la aplicación de Lola en Meta se realiza una sola vez por el equipo administrador. Sus credenciales (`META_APP_ID` y `META_APP_SECRET`) se guardan como secretos de Supabase Edge Functions, nunca en el navegador ni en el código. En Meta se registra como OAuth redirect URI:

`https://apqgrwudkfytwikrsivd.supabase.co/functions/v1/lola-instagram-oauth`

La app necesita los permisos `instagram_business_basic` e `instagram_business_content_publish`. Los tokens de usuario se guardan en una tabla protegida con RLS y nunca se devuelven al navegador. Si la configuración aún no está lista, Lola muestra un aviso claro y no pide a la persona que configure Meta o Supabase.

Cada mail de DoingLio mantiene su propia asociación con Instagram. Por ejemplo, un mail puede quedar vinculado a un perfil personal y otro mail a Revalsoft IA. Desde Lola, el botón **Cambiar perfil** vuelve a abrir la autorización oficial con reautenticación forzada; si la persona cancela, se conserva la conexión anterior.

