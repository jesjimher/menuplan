# Datos de ejemplo

## Recetas (`sample-recipes.sql`)

Contiene las 122 recetas de ejemplo para arrancar la aplicación en un entorno nuevo.

### Importar

```bash
sqlite3 menuplan.db < data/sample-recipes.sql
```

Si la base de datos aún no existe, SQLite la creará automáticamente. Si ya existe y tiene recetas cargadas, los `INSERT` fallarán por conflicto de IDs — borra el fichero `.db` antes de importar o usa una base de datos vacía.
