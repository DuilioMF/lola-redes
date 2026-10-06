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

Cada mail de DoingLio puede mantener **varias cuentas de Instagram autorizadas**. La primera se conecta con **Ya tengo Instagram** y las siguientes con **Agregar cuenta**. Lola guarda cada perfil por su `instagram_user_id`, muestra un selector cuando hay más de uno y publica siempre usando el perfil activo seleccionado. No usa conector local, CMD, ZIP ni tokens manuales; la contraseña social nunca pasa por Lola.



## Conectar Facebook

Lola usa autorización oficial de Meta para conectar Facebook, sin pedir ni guardar la contraseña. Al autorizar, Lola obtiene las Páginas de Facebook que administra la persona y permite elegir cuál queda activa.

- Edge Function: `lola-facebook-oauth`
- Permisos solicitados: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
- Soporta más de una Página y selección de Página activa.
- Los tokens de Página quedan sólo en Supabase; no se exponen al navegador.
