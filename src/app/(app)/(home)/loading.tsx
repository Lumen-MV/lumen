import { HeroSkeleton } from "@/components/catalog/hero-skeleton";
import { HomeRowSkeleton } from "@/components/catalog/row-skeleton";

/** Home `loading` state (screen-home.js): hero skeleton + 3 rows (6 wide, 8, 8) with grey title bars 180/240/200. */
export default function HomeLoading() {
  return (
    <main>
      <HeroSkeleton />
      <HomeRowSkeleton titleWidth={180} n={6} wide />
      <HomeRowSkeleton titleWidth={240} n={8} />
      <HomeRowSkeleton titleWidth={200} n={8} />
    </main>
  );
}
