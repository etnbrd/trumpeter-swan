export const refToA = () => {};

export const refToB = () => {};

export const hello = {
  a: refToA,
  b: refToB,
};

export const newA = refToA;

refToA();
