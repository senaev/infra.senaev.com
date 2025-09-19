/**
 * Функция используется для проверки, что переданный ей аргумент имеет тип
 * never. Это позволяет на уровне статических проверок увидеть, что
 * при изменении enum была пропущена обработка одного из вариантов.
 *
 * @example
 *      enum Test {
 *          one,
 *          two,
 *          tree
 *      }
 *
 *      function success(arg: Test) {
 *          switch(arg) {
 *              case Test.one:
 *              case Test.two:
 *              case Test.tree: // <---
 *                  return;
 *              default:
 *                  isNever(arg);
 *          }
 *      }
 *
 *      function fail(arg: Test) {
 *          switch(arg) {
 *              case Test.one:
 *              case Test.two:
 *                  return;
 *              default:
 *                  isNever(arg); <-- type error "Test.tree is not never"
 *          }
 *      }
 */
export function isNever(_: never) {}
