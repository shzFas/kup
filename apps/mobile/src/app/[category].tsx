import { Redirect, useLocalSearchParams } from 'expo-router';

const KNOWN = ['cars', 'motorcycles', 'mopeds', 'apartments'];

/** Deep links like kup://cars?make=toyota&year=2015..2020 open the same search results. */
export default function CategoryDeepLink() {
  const params = useLocalSearchParams<Record<string, string>>();
  const category = String(params.category);
  if (!KNOWN.includes(category)) return <Redirect href="/" />;
  return <Redirect href={{ pathname: '/search/[category]', params: { ...params, category } }} />;
}
