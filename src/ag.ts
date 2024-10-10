/**
 * AsyncGeneratorFunction
 */
export const AGF = (() => {
    try {
        Function(
            "return (async function*(){}).constructor",
        )();
    } catch {
        return (async function* () {}).constructor;
    }
})() as AsyncGeneratorFunction;

type AGValue<T> = T extends AsyncGenerator<infer V, unknown, unknown> ? V
    : unknown;
type AGReturn<T> = T extends AsyncGenerator<unknown, infer R, unknown> ? R
    : unknown;
type AGNext<T> = T extends AsyncGenerator<unknown, unknown, infer N> ? N
    : unknown;

/**
 * 持续迭代一个异步迭代器直到结束
 * @example
 * ```ts
 * // const r: number
 * const r = await ag_done((async function* () {
 *     return 1;
 * })());
 * ```
 */
export const ag_done = async <T extends AsyncGenerator>(
    ag: T,
    each?: (value: AGValue<T>) => AGNext<T>,
): Promise<AGReturn<T>> => {
    let next: any;
    while (true) {
        const item = await ag.next(next);
        if (item.done) {
            return item.value as AGReturn<T>;
        }
        if (each) {
            next = each(item.value as AGValue<T>);
        }
    }
};

/**
 * 持续迭代一个异步迭代器直到结束，接受 promise.then 的参数
 *
 * @example
 * ```ts
 * // const r: 1 | boolean
 * const r = await ag_then(
 *     (async function* () {
 *     })(),
 *     () => 1 as const,
 *     () => false,
 * );
 * ```
 */
export const ag_then = <
    T extends AsyncGenerator,
    ARGS extends Parameters<Promise<AGReturn<T>>["then"]> = Parameters<
        Promise<AGReturn<T>>["then"]
    >,
>(
    ag: T,
    ...args: ARGS
): Promise<
    ReturnType<
        FilterNotNull<ARGS>[number]
    >
> => {
    return ag_done(ag).then(...args) as any;
};

type FilterNotNull<A> = A extends (infer T)[] ? NonNullable<T>[] : [];
