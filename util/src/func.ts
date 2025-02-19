// deno-lint-ignore-file ban-types

import { isPromiseLike } from "./promise.ts";

/**
 * 函数转化，实现将 this 可以作为第一个参数来传参
 */
export const uncurryThisFn = <T, ARGS extends readonly unknown[], R>(
    func: (this: T, ...args: ARGS) => R,
): (self: T, ...restArgs: ARGS) => R => {
    // deno-lint-ignore no-explicit-any
    return Function.prototype.call.bind(func) as any;
};
/**
 * 函数转化，实现将第一个参数作为 this 来传参
 */
export const curryThisFn = <T, ARGS extends readonly unknown[], R>(
    func: (self: T, ...args: ARGS) => R,
): (this: T, ...args: ARGS) => R => {
    return function (this: T, ...args: ARGS): R {
        return func(this, ...args);
    };
};

/**
 * 类型安全的函数定义
 */
export type Func<This = any, Arguments extends readonly unknown[] = any[], Return extends unknown = any> =
    Arguments["length"] extends 0 ? (this: This) => Return
        : (
            this: This,
            ...args: Arguments
        ) => Return;
export namespace Func {
    export type Return<F> = F extends Func ? ReturnType<F> : never;
    export type Args<F> = F extends Func ? Parameters<F> : never;
    export type This<F> = F extends Func<infer T> ? T : never;
    export type SetReturn<T, R> = Func<This<T>, Args<T>, R>;
}
type KeyFun<F extends Func> = Func<ThisParameterType<F>, Parameters<F>>;
export type FuncRemember<
    F extends Func,
    K extends (KeyFun<F> | void) = void,
> = F & {
    readonly source: F;
    readonly key: Func.Return<K> | undefined;
    readonly runned: boolean;
    readonly returnValue: Func.Return<F> | undefined;
    reset(): void;
    rerun(...args: Parameters<F>): Func.Return<F>;
};
/**
 * 让一个函数的返回结果是缓存的
 * @param key 自定义缓存key生成器，如果生成的key不一样，那么缓存失效
 * @returns
 */
export const func_remember = <
    F extends Func,
    K extends Func<ThisParameterType<F>, Parameters<F>> | void | void,
>(func: F, key?: K): FuncRemember<F, K> => {
    let result: {
        key: Func.Return<K>;
        res: Func.Return<F>;
    } | undefined;

    const once_fn = function (
        this: ThisParameterType<F>,
        ...args: Parameters<F>
    ) {
        const newKey = key?.apply(this, args);
        if (result === undefined || newKey !== result.key) {
            result = {
                key: newKey,
                res: func.apply(this, args),
            };
        }
        return result.res;
    };

    const once_fn_mix = Object.assign(once_fn as F, {
        /// 注意，这的get
        get source() {
            return func;
        },
        get key() {
            return result?.key;
        },
        get runned() {
            return result != null;
        },
        get returnValue() {
            return result?.res;
        },
        reset() {
            result = undefined;
        },
        rerun(...args: Parameters<F>) {
            once_fn_mix.reset();
            return once_fn_mix(...args) as Func.Return<F>;
        },
    });
    Object.defineProperties(once_fn_mix, {
        source: { value: func, writable: false, configurable: true, enumerable: true },
        key: { get: () => result?.key, configurable: true, enumerable: true },
        runned: { get: () => result != null, configurable: true, enumerable: true },
        returnValue: { get: () => result?.res, configurable: true, enumerable: true },
    });
    return once_fn_mix;
};

/**
 * 包裹一个“目标函数”，将它的执行权交给“包裹函数”。
 * 包裹函数可以在目标函数执行之前或者执行之后做一些工作，比如参数检查，比如返回值修改
 * @param func 目标函数
 * @param wrapper 包裹函数，第一个参数是 context，可以获得详细的上下文；第二个参数是 next，可以用于快速执行“目标函数”
 */
export const func_wrap = <F extends Func, R>(
    func: F,
    wrapper: (
        context: {
            target: F;
            this: ThisParameterType<F>;
            arguments: Parameters<F>;
        },
        next: () => ReturnType<F>,
    ) => R,
): (this: ThisParameterType<F>, ...args: Parameters<F>) => R => {
    return function (this: ThisParameterType<F>, ...args: Parameters<F>) {
        const context = {
            target: func,
            this: this,
            arguments: args,
        };
        return wrapper(
            context,
            () => Reflect.apply(func, context.this, context.arguments),
        );
    };
};

type PrototypeToThis<T> = T extends String ? string
    : T extends Number ? number
    : T extends Boolean ? boolean
    : T extends BigInt ? bigint
    : T extends Symbol ? symbol
    : T;
/**
 * 向某一个对象配置函数属性
 */
export const extendsMethod = <T extends object>(
    target: T,
    prop: PropertyKey,
    method: Func<PrototypeToThis<T>>,
): void => {
    Object.defineProperty(target, prop, {
        configurable: true,
        writable: true,
        value: method,
    });
};

/**
 * 向某一个对象配置getter属性
 */
export const extendsGetter = <T extends object>(
    target: T,
    prop: PropertyKey,
    getter: Func<PrototypeToThis<T>, []>,
): void => {
    Object.defineProperty(target, prop, {
        configurable: true,
        get: getter,
    });
};

export interface FuncCatch {
    <E = unknown, F extends Func = Func>(fn: F, errorParser?: (err: unknown) => E): FuncCatchWrapper<E, F>;
}
export type FuncCatchWrapper<E, F extends Func> =
    & Func<
        ThisParameterType<F>,
        Parameters<F>,
        FuncCatchReturn<E, ReturnType<F>>
    >
    & {
        catchType<E>(errorParser?: (err: unknown) => E): FuncCatchWrapper<E, F>;
    };
export type FuncCatchReturn<E, R> = R extends PromiseLike<infer R> ? PromiseLike<[E, undefined] | [undefined, R]>
    : [E, undefined] | [undefined, R];
/** 包裹一个函数，并对其进行错误捕捉并返回 */
export const func_catch: FuncCatch = <E = unknown, F extends Func = Func>(fn: F, errorParser?: (err: unknown) => E) => {
    return Object.assign(function (this: ThisParameterType<F>) {
        try {
            const res: ReturnType<F> = fn.apply(this, arguments as any);
            if (isPromiseLike(res)) {
                return res.then(
                    (value: unknown) => [undefined, value],
                    (err: unknown) => [errorParser ? errorParser(err) : err as E, undefined],
                );
            }
            return [undefined, res];
        } catch (err) {
            return [errorParser ? errorParser(err) : err as E, undefined];
        }
    }, {
        catchType<E>(errorParser?: (err: unknown) => E) {
            return func_catch(fn, errorParser);
        },
    }) as FuncCatchWrapper<E, F>;
};
