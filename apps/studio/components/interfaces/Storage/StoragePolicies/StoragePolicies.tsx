import { PostgresPolicy } from '@supabase/postgres-meta'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useParams } from 'common'
import { isEmpty } from 'lodash'
import { Search, X } from 'lucide-react'
import { parseAsString, useQueryState } from 'nuqs'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import PolicyEditorModal from 'components/interfaces/Auth/Policies/PolicyEditorModal'
import { useMainScrollContainer } from 'components/layouts/MainScrollContainerContext'
import { NoSearchResults } from 'components/ui/NoSearchResults'
import { useDatabasePoliciesQuery } from 'data/database-policies/database-policies-query'
import { useDatabasePolicyCreateMutation } from 'data/database-policies/database-policy-create-mutation'
import { useDatabasePolicyDeleteMutation } from 'data/database-policies/database-policy-delete-mutation'
import { useDatabasePolicyUpdateMutation } from 'data/database-policies/database-policy-update-mutation'
import { usePaginatedBucketsQuery, type Bucket } from 'data/storage/buckets-query'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { useStaticEffectEvent } from 'hooks/useStaticEffectEvent'
import {
  Button,
  Collapsible_Shadcn_,
  CollapsibleContent_Shadcn_,
  CollapsibleTrigger_Shadcn_,
} from 'ui'
import { GenericSkeletonLoader, ShimmeringLoader } from 'ui-patterns'
import { Input } from 'ui-patterns/DataInputs/Input'
import ConfirmModal from 'ui-patterns/Dialogs/ConfirmDialog'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
} from 'ui-patterns/PageSection'
import { formatPoliciesForStorage, type PoliciesByBucket } from '../Storage.utils'
import { StoragePoliciesBucketRow } from './StoragePoliciesBucketRow'
import StoragePoliciesEditPolicyModal from './StoragePoliciesEditPolicyModal'
import StoragePoliciesPlaceholder from './StoragePoliciesPlaceholder'

type SelectPolicyForAction = {
  addPolicy: (bucketName?: string, table?: string) => void
  editPolicy: (policy: PostgresPolicy, bucketName?: string, table?: string) => void
  deletePolicy: (policy: PostgresPolicy) => void
}

export const StoragePolicies = () => {
  const { ref: projectRef } = useParams()
  const { data: project } = useSelectedProjectQuery()

  const [selectedPolicyToEdit, setSelectedPolicyToEdit] = useState<PostgresPolicy>()
  const [selectedPolicyToDelete, setSelectedPolicyToDelete] = useState<PostgresPolicy>()
  const [isEditingPolicyForBucket, setIsEditingPolicyForBucket] = useState<{
    bucket: string
    table: string
  }>()
  const [searchString, setSearchString] = useQueryState(
    'search',
    parseAsString.withDefault('').withOptions({ history: 'replace', clearOnDefault: true })
  )

  const {
    data: bucketsData,
    isPending: isLoadingBuckets,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = usePaginatedBucketsQuery({
    projectRef,
  })
  const buckets = useMemo(() => bucketsData?.pages.flatMap((page) => page) ?? [], [bucketsData])

  const {
    data: policies = [],
    refetch,
    isPending: isLoadingPolicies,
  } = useDatabasePoliciesQuery({
    projectRef: project?.ref,
    connectionString: project?.connectionString,
    schema: 'storage',
  })

  const isLoading = isLoadingBuckets || isLoadingPolicies

  const { mutateAsync: createDatabasePolicy } = useDatabasePolicyCreateMutation({
    onError: () => {},
  })
  const { mutateAsync: updateDatabasePolicy } = useDatabasePolicyUpdateMutation()
  const { mutate: deleteDatabasePolicy } = useDatabasePolicyDeleteMutation({
    onSuccess: async () => {
      await refetch()
      toast.success('Successfully deleted policy!')
      setSelectedPolicyToDelete(undefined)
    },
  })

  // Only use storage policy editor when creating new policies for buckets
  const showStoragePolicyEditor =
    isEmpty(selectedPolicyToEdit) &&
    !isEmpty(isEditingPolicyForBucket) &&
    (isEditingPolicyForBucket.bucket ?? '').length > 0

  const showGeneralPolicyEditor = !isEmpty(isEditingPolicyForBucket) && !showStoragePolicyEditor

  // Policies under storage.objects
  const storageObjectsPolicies = policies.filter(
    (x) => x.schema === 'storage' && x.table === 'objects'
  )
  const formattedStorageObjectPolicies = formatPoliciesForStorage(buckets, storageObjectsPolicies)
  const ungroupedPolicies =
    formattedStorageObjectPolicies.find((x) => x.name === 'Ungrouped')?.policies ?? []

  // Policies under storage.buckets
  const storageBucketPolicies = policies.filter(
    (x) => x.schema === 'storage' && x.table === 'buckets'
  )

  /**
   * Filter buckets based on search string
   * - Filter buckets by name matching the search string
   * - Show all policies for filtered buckets (policies are not filtered)
   */
  const filteredBucketsWithPolicies = useMemo(() => {
    const searchFilter = searchString?.toLowerCase() || ''

    // Filter buckets by name if search filter is present
    const filteredBucketsList = searchFilter
      ? buckets.filter((bucket) => bucket.name.toLowerCase().includes(searchFilter))
      : buckets

    // Get policies for filtered buckets (show all policies, don't filter them)
    // Show all filtered buckets, even if they don't have policies (similar to auth/policies.tsx)
    const filteredBucketsWithPoliciesList = filteredBucketsList.map((bucket) => {
      const policies =
        formattedStorageObjectPolicies.find((x) => x.name === bucket.name)?.policies ?? []
      return { bucket, policies }
    })

    // Schema-level policies should always be shown, unaffected by search filter
    return filteredBucketsWithPoliciesList
  }, [buckets, searchString, formattedStorageObjectPolicies])

  const onSelectPolicyAdd: SelectPolicyForAction['addPolicy'] = (bucketName = '', table = '') => {
    setSelectedPolicyToEdit(undefined)
    setIsEditingPolicyForBucket({ bucket: bucketName, table })
  }

  const onSelectPolicyEdit: SelectPolicyForAction['editPolicy'] = (
    policy,
    bucketName = '',
    table = ''
  ) => {
    setIsEditingPolicyForBucket({ bucket: bucketName, table })
    setSelectedPolicyToEdit(policy)
  }

  const onCancelPolicyEdit = () => {
    setIsEditingPolicyForBucket(undefined)
  }

  const onSelectPolicyDelete: SelectPolicyForAction['deletePolicy'] = (policy: any) =>
    setSelectedPolicyToDelete(policy)
  const onCancelPolicyDelete = () => setSelectedPolicyToDelete(undefined)

  const onSavePolicySuccess = async () => {
    toast.success('Successfully saved policy!')
    await refetch()
    onCancelPolicyEdit()
  }

  /*
    Functions that involve the CRUD for policies
    For each API call within the Promise.all, return true if an error occurred, else return false
  */
  const onCreatePolicies = async (payloads: any[]) => {
    if (!project) {
      console.error('Project is required')
      return true
    }

    try {
      return await Promise.all(
        payloads.map(async (payload) => {
          try {
            await createDatabasePolicy({
              projectRef: project?.ref,
              connectionString: project?.connectionString,
              payload,
            })
            return false
          } catch (error: any) {
            toast.error(`Error adding policy: ${error.message}`)
            return true
          }
        })
      )
    } finally {
    }
  }

  const onCreatePolicy = async (payload: any) => {
    if (!project) {
      console.error('Project is required')
      return true
    }

    try {
      await createDatabasePolicy({
        projectRef: project?.ref,
        connectionString: project?.connectionString,
        payload,
      })
      return false
    } catch (error: any) {
      toast.error(`Error adding policy: ${error.message}`)
      return true
    }
  }

  const onUpdatePolicy = async (payload: any) => {
    if (!project) {
      console.error('Project is required')
      return true
    }
    if (!selectedPolicyToEdit) {
      console.error('Unable to find policy')
      return true
    }

    try {
      await updateDatabasePolicy({
        projectRef: project?.ref,
        connectionString: project?.connectionString,
        originalPolicy: selectedPolicyToEdit,
        payload,
      })
      return false
    } catch (error: any) {
      toast.error(`Error updating policy: ${error.message}`)
      return true
    }
  }

  const onDeletePolicy = async () => {
    if (!project) return console.error('Project is required')
    if (!selectedPolicyToDelete) return console.error('Unable to find policy')

    deleteDatabasePolicy({
      projectRef: project?.ref,
      connectionString: project?.connectionString,
      originalPolicy: selectedPolicyToDelete,
    })
  }

  return (
    <>
      <PageContainer>
        {isLoading ? (
          <PageSection>
            <PageSectionContent>
              <GenericSkeletonLoader />
            </PageSectionContent>
          </PageSection>
        ) : (
          <div>
            <BucketsPolicies
              buckets={buckets}
              policies={formattedStorageObjectPolicies}
              search={searchString}
              setSearch={setSearchString}
              actions={{
                addPolicy: onSelectPolicyAdd,
                editPolicy: onSelectPolicyEdit,
                deletePolicy: onSelectPolicyDelete,
              }}
              pagination={{
                hasNextPage,
                isFetchingNextPage,
                fetchNextPage,
              }}
            />

            <PageSection>
              <PageSectionMeta>
                <PageSectionSummary>
                  <PageSectionTitle>Schema</PageSectionTitle>
                  <PageSectionDescription>
                    Write policies for the tables under the storage schema directly for greater
                    control
                  </PageSectionDescription>
                </PageSectionSummary>
              </PageSectionMeta>
              <PageSectionContent>
                <div className="flex flex-col gap-y-4">
                  {/* Section for policies under storage.objects that are not tied to any buckets */}
                  <StoragePoliciesBucketRow
                    table="objects"
                    label="Other policies under storage.objects"
                    policies={ungroupedPolicies}
                    onSelectPolicyAdd={onSelectPolicyAdd}
                    onSelectPolicyEdit={onSelectPolicyEdit}
                    onSelectPolicyDelete={onSelectPolicyDelete}
                  />

                  {/* Section for policies under storage.buckets */}
                  <StoragePoliciesBucketRow
                    table="buckets"
                    label="Policies under storage.buckets"
                    policies={storageBucketPolicies}
                    onSelectPolicyAdd={onSelectPolicyAdd}
                    onSelectPolicyEdit={onSelectPolicyEdit}
                    onSelectPolicyDelete={onSelectPolicyDelete}
                  />
                </div>
              </PageSectionContent>
            </PageSection>
          </div>
        )}
      </PageContainer>

      {/* Only used for adding policies to buckets */}
      <StoragePoliciesEditPolicyModal
        visible={showStoragePolicyEditor}
        bucketName={isEditingPolicyForBucket?.bucket}
        onSelectCancel={onCancelPolicyEdit}
        onCreatePolicies={onCreatePolicies}
        onSaveSuccess={onSavePolicySuccess}
      />

      {/* Adding policies to objets/buckets table or editting any policy uses the general policy editor */}
      <PolicyEditorModal
        schema="storage"
        visible={showGeneralPolicyEditor}
        table={isEditingPolicyForBucket?.table ?? ''}
        selectedPolicyToEdit={selectedPolicyToEdit}
        onSelectCancel={onCancelPolicyEdit}
        onCreatePolicy={onCreatePolicy}
        onUpdatePolicy={onUpdatePolicy}
        onSaveSuccess={onSavePolicySuccess}
      />

      <ConfirmModal
        danger
        visible={!isEmpty(selectedPolicyToDelete)}
        title="Confirm to delete policy"
        description={`This is permanent! Are you sure you want to delete the policy "${selectedPolicyToDelete?.name}"`}
        buttonLabel="Delete"
        buttonLoadingLabel="Deleting"
        onSelectCancel={onCancelPolicyDelete}
        onSelectConfirm={onDeletePolicy}
      />
    </>
  )
}

type BucketsPoliciesProps = {
  buckets: Bucket[]
  policies: PoliciesByBucket

  search?: string
  setSearch: (search: string) => void

  actions: SelectPolicyForAction
  pagination: {
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
  }
}

const BucketsPolicies = ({
  buckets,
  policies,
  search,
  setSearch,
  actions,
  pagination,
}: BucketsPoliciesProps): ReactNode => {
  const filteredBucketsWithPolicies = useMemo(() => {
    const searchFilter = search?.toLowerCase() || ''

    const filteredBucketsList = searchFilter
      ? buckets.filter((bucket) => bucket.name.toLowerCase().includes(searchFilter))
      : buckets

    // Get policies for filtered buckets (show all policies, don't filter them)
    // Show all filtered buckets, even if they don't have policies
    return filteredBucketsList.map((bucket) => {
      const bucketPolicies = policies.find((x) => x.name === bucket.name)?.policies ?? []
      return { bucket, policies: bucketPolicies }
    })
  }, [buckets, policies, search])

  return (
    <PageSection>
      <Collapsible_Shadcn_>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Buckets</PageSectionTitle>
            <PageSectionDescription>
              Write policies for each bucket to control access to the bucket and its contents
            </PageSectionDescription>
          </PageSectionSummary>
          <CollapsibleTrigger_Shadcn_>
            <button>Toggle</button>
          </CollapsibleTrigger_Shadcn_>
        </PageSectionMeta>
        <CollapsibleContent_Shadcn_>
          <PageSectionContent className="mt-6">
            {buckets.length === 0 && <StoragePoliciesPlaceholder />}

            {buckets.length > 0 && (
              <div className="mb-4">
                <Input
                  size="tiny"
                  placeholder="Filter buckets"
                  className="block"
                  containerClassName="w-full lg:w-52"
                  value={search || ''}
                  onChange={(e) => {
                    const str = e.target.value
                    setSearch(str)
                  }}
                  icon={<Search />}
                  actions={
                    search ? (
                      <Button
                        size="tiny"
                        type="text"
                        className="p-0 h-5 w-5"
                        icon={<X />}
                        onClick={() => setSearch('')}
                      />
                    ) : null
                  }
                />
              </div>
            )}

            {!!search && search.length > 0 && filteredBucketsWithPolicies.length === 0 && (
              <NoSearchResults searchString={search} onResetFilter={() => setSearch('')} />
            )}

            <BucketsPoliciesVirtualizedList
              items={filteredBucketsWithPolicies}
              actions={actions}
              pagination={pagination}
            />
          </PageSectionContent>
        </CollapsibleContent_Shadcn_>
      </Collapsible_Shadcn_>
    </PageSection>
  )
}

type BucketsPoliciesVirtualizedListProps = {
  items: { bucket: Bucket; policies: PostgresPolicy[] }[]
  actions: SelectPolicyForAction
  pagination: BucketsPoliciesProps['pagination']
}

const BucketsPoliciesVirtualizedList = ({
  items,
  actions,
  pagination,
}: BucketsPoliciesVirtualizedListProps) => {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pagination

  const itemCount = hasNextPage ? items.length + 1 : items.length

  const scrollElement = useMainScrollContainer()
  const virtualizer = useVirtualizer({
    count: itemCount,
    estimateSize: () => 129,
    overscan: 5,
    getItemKey: (index) => items[index]?.bucket.name ?? `bucket-${index}`,
    getScrollElement: () => scrollElement,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const lastItem = virtualItems[virtualItems.length - 1]

  const fetchNext = useStaticEffectEvent(() => {
    if (lastItem && lastItem.index >= items.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  })
  useEffect(fetchNext, [lastItem, fetchNext])

  return (
    <div
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualItems.map((virtualRow) => {
        const isLoaderRow = virtualRow.index > items.length - 1
        const commonStyle = {
          position: 'absolute' as const,
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRow.start}px)`,
        }

        if (isLoaderRow) {
          return (
            <div
              key={`loader-${virtualRow.index}`}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="pb-4"
              style={commonStyle}
            >
              <BucketsPoliciesLoader />
            </div>
          )
        }

        const item = items[virtualRow.index]
        if (!item) return null

        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="pb-4"
            style={commonStyle}
          >
            <StoragePoliciesBucketRow
              table="objects"
              label={item.bucket.name}
              bucket={item.bucket}
              policies={item.policies}
              onSelectPolicyAdd={actions.addPolicy}
              onSelectPolicyEdit={actions.editPolicy}
              onSelectPolicyDelete={actions.deletePolicy}
            />
          </div>
        )
      })}
    </div>
  )
}

const BucketsPoliciesLoader = () => (
  <>
    <p className="sr-only">Loading more...</p>
    <ShimmeringLoader />
  </>
)
