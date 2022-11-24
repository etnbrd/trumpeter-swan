import { hello, newA } from "./foo";

export const main = (param: "a" | "b") => {
  const result = param === "a" ? hello.a() : hello.b();
  const other = hello.a;
  const altResult = other();
  return [result, altResult];
};

export const bar = () => {
  newA();
};
