# Sublimo Shop

Version para publicar en GitHub Pages con panel protegido por Supabase.

## Que incluye

- Catalogo publico de productos.
- Busqueda y filtro por categoria.
- Botones de WhatsApp por producto.
- Logo y banners responsive.
- Modo claro/oscuro.
- Panel de administracion con login de Supabase.

## Archivos

- `index.html`: pagina publica.
- `admin.html`: panel de administracion.
- `styles.css`: estilos responsive.
- `app-public.js`: logica de la tienda publica.
- `admin-supabase.js`: logica del panel privado.
- `supabase-config.js`: configuracion publica de Supabase.
- `supabase-setup.sql`: tablas, datos iniciales y reglas de seguridad.
- `sublimo-logo.png`: logo.
- `hero-sublimo.png`: banner de escritorio.
- `hero-sublimo-mobile.png`: banner para celular.

## Seguridad

Esta version no guarda contrasenas en el codigo. El panel usa Supabase Auth y reglas RLS en la base de datos.

Cualquiera puede abrir `admin.html`, pero solo el usuario autorizado en Supabase puede crear, editar o eliminar productos.
