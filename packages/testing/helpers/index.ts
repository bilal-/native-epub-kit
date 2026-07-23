export type ContractFixture<T> = Readonly<{
  name: string;
  value: T;
}>;

export function defineContractFixture<T>(name: string, value: T): ContractFixture<T> {
  const normalizedName = name.trim();

  if (normalizedName.length === 0) {
    throw new TypeError('Contract fixture names must not be empty.');
  }

  return Object.freeze({
    name: normalizedName,
    value,
  });
}
