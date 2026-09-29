/**
 * The function is used to check that the argument passed to it has the type
 * never. This lets static checks show that, after an enum change,
 * the handling of one of the variants was missed.
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
