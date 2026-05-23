# Seguridad en GitHub Pages

GitHub Pages publica archivos estaticos. Eso significa que todo HTML, CSS, JavaScript e imagenes pueden ser vistos por cualquier persona.

## Solucion usada

Se preparo una version para GitHub en la carpeta:

```text
github-public
```

Esa version:

- No guarda contrasenas dentro del codigo.
- Incluye `admin.html`, pero protegido por Supabase Auth.
- Protege crear, editar y eliminar productos con reglas RLS en Supabase.
- Permite que cualquiera vea productos, pero solo tu usuario autorizado puede administrar.

## Importante

La `anon key` de Supabase puede estar en el navegador. Es normal. La seguridad real esta en las politicas RLS de Supabase, no en ocultar esa clave.
