"use client";

import { useMemo, useState } from "react";
import { Field, Input, Select } from "@/components/ui/input";

type CompanyOption = {
  id: string;
  name: string;
};

type CompanyOrganisationFieldProps = {
  value: string;
  onChange: (value: string) => void;
  companies?: CompanyOption[];
  label?: string;
  placeholder?: string;
};

const CUSTOM_COMPANY_VALUE = "__custom_company__";

export function CompanyOrganisationField({
  value,
  onChange,
  companies = [],
  label = "Company / organisation",
  placeholder = "Company or organisation",
}: CompanyOrganisationFieldProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const companyNames = useMemo(() => companies.map((company) => company.name), [companies]);
  const hasManagedCompanies = companyNames.length > 0;
  const isKnownCompany = companyNames.includes(value);
  const showCustomInput = customOpen || Boolean(value && !isKnownCompany);
  const selectValue = showCustomInput ? CUSTOM_COMPANY_VALUE : value;

  if (!hasManagedCompanies) {
    return (
      <Field label={label}>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="organization"
        />
      </Field>
    );
  }

  return (
    <div className="space-y-1.5">
      <span className="flex items-center gap-1 text-sm font-semibold text-ink-soft">
        {label}
      </span>
      <div className="space-y-2">
        <Select
          aria-label={label}
          value={selectValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (nextValue === CUSTOM_COMPANY_VALUE) {
              setCustomOpen(true);
              onChange(isKnownCompany ? "" : value);
              return;
            }
            setCustomOpen(false);
            onChange(nextValue);
          }}
        >
          <option value="">Select company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.name}>
              {company.name}
            </option>
          ))}
          <option value={CUSTOM_COMPANY_VALUE}>Other company</option>
        </Select>
        {showCustomInput && (
          <Input
            aria-label="Other company name"
            value={isKnownCompany ? "" : value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            autoComplete="organization"
          />
        )}
      </div>
    </div>
  );
}
