Necesito una aplicación web con las siguientes características:
# Objetivo
Permitir planificar menús semanales, teniendo en cuenta diferentes reglas y requisitos

# Tecnología

La aplicación será una aplicación web, utilizando Svelte y una base de datos SQLite que permita guardar los datos en un fichero, sin necesidad de disponer de una base de datos adicional. 

Deberá poder desplegarse mediante Docker, de manera que se debe construir un Dockerfile, así como un docker-compose.yaml de ejemplo. La imagen estará diseñada de manera que la base de datos se pueda montar como un volumen de una carpeta montada, de manera que sea accesible desde fuera del contenedor para hacer copias o similar. Además de como Docker, para depurar se debe poder ejecutar la aplicación, de manera que se pueda ejecutar en un navegador.

La aplicación debe funcionar tanto en escritorio como en móvil. Y debe poder funcionar como página web instalable, para que en Android se pueda instalar como una app más.

# Pantallas
La aplicación consistirá en una pantalla principal, con una barra lateral donde se escogerá qué pantalla ver. Las pantallas disponibles serán:

## Semana 
La pantalla principal mostrará la semana actual. Para cada día, se verán las comidas y cenas configuradas (por defecto una comida y una cena). Para cada día de la semana, con un pequeño botón de opciones se podrá personalizar cuántas recetas hay que escoger para la comida y cena, así como el número de acompañamientos (por comida/cena si hay más de una, o en total para esa comida/cena). Los valores por defecto se establecerán en la pantalla de opciones, aquí se podrán modificar para días concretos.

Para cada comida/cena/acompañamiento, se deberá poder establecer opcionalmente a uno o varios de los miembros de la familia. Si una comida/cena/acompañamiento es para un miembro concreto, se deberán respetar sus requisitos (tags que no puede comer, tags con preferencias positivas o negativas) a la hora de calcular recetas. Si una comida/cena/acompañamiento no tiene miembro asociado, se asumirá que es para todos, y en los cálculos se deberán tener en cuenta únicamente los tags que no puede comer.

En cada comida, cena o acompañamiento, se podrá escoger la receta que se hará ese día. Sólo aparecerán las que tengan en tag "comida" si es una comida, y "cena" si es una cena, etc. La selección será en un desplegable o similar, en el que se pueda buscar por coincidencia de nombre, descripción o etiquetas. Mientras esté abierto el desplegable de selección, también se mostrará en algún sitio las 3 recetas más planificadas en ese día de la semana y comida/cena.

También habrá un botón para eliminar la receta de ese día.

En la parte superior se debe mostrar el grado de cumplimiento de las reglas. Si en algún momento la combinación de recetas no cumple las reglas, deberá mostrarse ahí cuáles no se están cumpliendo.

Además de la selección manual, deberá haber en comida, cena, etc. un botón para escoger una receta aleatoria. Esta selección aleatoria deberá cumplir las reglas establecidas.

Además de escoger recetas individuales, debe haber un botón para "Calcular plan semanal". Este botón asignará recetas aleatoriamente, pero de forma que se cumplan las reglas establecidas. La selección debe ser aleatoria, cada vez que se pulse deben ser recetas diferentes. Sólo asignará recetas a las comidas/cenas que no tengan recetas establecidas. Por tanto, sólo deberá "rellenar los huecos" de las comidas/cenas que aún no tengan recetas. También habrá un botón para "Limpiar plan", que dejará todos los días en blanco. Y otro de "Copiar semana anterior", que copiará las recetas de la semana anterior en la semana actual.

## Recetas
Aquí se verá la lista de recetas disponibles. Cada receta tendrá:
- Nombre
- Descripción
- Lista de tags
- Nº de días mínimo entre ocurrencias de esta receta

Las recetas se podrán añadir a mano, o bien se podrán importar permitiendo pegar texto. El formato será el de Plantoeat:

Title: Biquinis
Serves: 6
Photo Url: https://plantoeat.s3.amazonaws.com/recipes/22897398/82c2ec774cfcac255e43554e57ca10ede21ba54c-original.jpg?1580460703
Prep Time: 10 Min
Course: Cena
Tags: Rápido
Ingredients:
12 rebanadas pan de molde
6 tranchettes
6 lonchas jamón york
Directions:
Hacer en la sandwichera

--------------

Title: Fajitas
Serves: 8
Photo Url: https://plantoeat.s3.amazonaws.com/recipes/22897415/2fc310e69360c6b9863c994866b645dbf1e2aeab-original.jpg?1580460867
Prep Time: 15 Min
Course: Cena
Tags: Rápido
Ingredients:
8 Fajitas
1 Tomate
1 aguacates
4 latas atún
Lechuga
Directions:
Cortar el tomate y el aguacate, y listos.


## Miembros de la familia
Aquí se mostrarán los diferentes miembros de la familia. Para cada miembro, se guardará:
- Nombre
- No puede comer (lista de tags que no puede comer por alergias, intolerancias o similar)
- Le gusta: (lista de tags que le gustan)
- No le gusta: (lista de tags que no le gustan)

Se deben poder añadir, eliminar y modificar miembros de la familia

## Reglas
Aquí se establecerán las reglas que debe cumplir el plan semanal. Cada regla tendrá tres partes:
- Tag: Tag al que se refiere la regla
- Al menos /no más de
- Número de veces

Por ejemplo, se podría establecer que debe haber al menos 2 ocurrencias de pescado a la semana. O no más de 5 ocurrencias de carne.

## Histórico
Aquí se debe poder consultar el histórico de recetas

## Opciones
Aquí se establecerán parámetros comunes:
- Valor mínimo por defecto para los días entre distintas ocurrencias de la misma receta. Aunque se podrá establecer receta por receta, si una receta no lo tiene establecido, se usará este valor, que por defecto será 5
- Número de comidas al día: (por defecto 1)
- Número de cenas al día: (por defecto 1)
- Número de acompañamientos por receta: Cuántos acompañamientos se deben planificar para cada receta. Por defecto el valor es 1. Por ejemplo, si se establece que los martes hay dos comidas y una cena, con el valor a 1 habrá que escoger obligatoriamente dos acompañamientos en la comida, y uno en la cena.
- Número de acompañamientos por franja horaria: Cuántos acompañamientos se deben planificar para la franja horaria en global, independientemente de si se han planificado varias comidas/cenas o no. Por ejemplo, si el martes hay dos comidas que planificar y una cena, el parámetro anterior está a cero, y esté valor está a 1, habrá que planificar un único acompañamiento para la comida, y otro para la cena.

