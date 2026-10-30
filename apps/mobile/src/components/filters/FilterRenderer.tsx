import { Fragment } from 'react';
import { View } from 'react-native';
import { filterValuesForDeps, isDependencyMet, type CategorySchema, type FilterDef, type Filters, type FilterValue } from '@kup/shared';
import { orderedGroups } from '@/lib/queries';
import { useColors } from '@/lib/theme';
import { Divider, T } from '../ui';
import { MultiWidget, RangeWidget, RefWidget, SelectWidget, ToggleWidget } from './widgets';

/** Renders the filter panel from schema.filters, grouped by schema.groups, honouring depends_on. */
export function FilterRenderer({
  schema,
  value,
  onChange,
  facets,
  names,
  onOpenRef,
}: {
  schema: CategorySchema;
  value: Filters;
  onChange: (key: string, v: FilterValue | undefined) => void;
  facets: Record<string, Record<string, number>>;
  names: Record<string, string>;
  onOpenRef: (def: FilterDef) => void;
}) {
  const c = useColors();
  const deps = filterValuesForDeps(value);
  const visible = schema.filters.filter((d) => isDependencyMet(d.depends_on, deps));
  const groups = orderedGroups(schema, visible.map((d) => d.group));
  const labelOf = (key: string) => schema.filters.find((f) => f.key === key)?.label.toLowerCase() ?? key;

  return (
    <View>
      {groups.map((g) => (
        <View key={g.key} style={{ marginTop: 12 }}>
          <T variant="small" color="secondary" style={{ paddingHorizontal: 16, paddingBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {g.label}
          </T>
          <View style={{ backgroundColor: c.card, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' }}>
            {visible
              .filter((d) => d.group === g.key)
              .map((d, i) => {
                const set = (v: FilterValue | undefined) => onChange(d.key, v);
                let w;
                switch (d.widget) {
                  case 'range':
                    w = <RangeWidget def={d} value={value[d.key]} onChange={set} />;
                    break;
                  case 'multi':
                  case 'multi_all':
                    w = <MultiWidget def={d} value={value[d.key]} onChange={set} counts={facets[d.key]} />;
                    break;
                  case 'toggle':
                    w = <ToggleWidget def={d} value={value[d.key]} onChange={set} />;
                    break;
                  case 'select':
                    w = <SelectWidget def={d} value={value[d.key]} onChange={set} />;
                    break;
                  case 'ref':
                    w = (
                      <RefWidget
                        def={d}
                        value={value[d.key]}
                        names={names}
                        disabledHint={d.parent && !value[d.parent] ? `Сначала выберите: ${labelOf(d.parent)}` : undefined}
                        onOpen={() => onOpenRef(d)}
                        onClear={() => set(undefined)}
                      />
                    );
                    break;
                }
                return (
                  <Fragment key={d.key}>
                    {i > 0 && <Divider />}
                    {w}
                  </Fragment>
                );
              })}
          </View>
        </View>
      ))}
    </View>
  );
}
