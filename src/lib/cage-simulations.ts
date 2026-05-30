import { supabase } from '@/src/lib/supabase';

export type CageObjectType = 'box' | 'cylinder';

export type CageSimulationObject = {
  id: string;
  type: CageObjectType;
  label: string;
  xCm: number;
  yCm: number;
  zCm: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  rotationY: number;
  color: string;
};

export type CageSimulationItem = {
  id: string;
  user_id: string;
  title: string;
  animal_species: string | null;
  cage_width_cm: number;
  cage_depth_cm: number;
  cage_height_cm: number;
  objects: CageSimulationObject[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

type SaveCageSimulationInput = {
  title: string;
  animalSpecies?: string | null;
  cageWidthCm: number;
  cageDepthCm: number;
  cageHeightCm: number;
  objects?: CageSimulationObject[];
  isPublic?: boolean;
};

type UpdateCageSimulationInput = SaveCageSimulationInput & {
  simulationId: string;
};

function normalizeObjects(value: unknown): CageSimulationObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const object = item as Record<string, unknown>;

      return {
        id: String(object.id ?? ''),
        type: object.type === 'cylinder' ? 'cylinder' : 'box',
        label: String(object.label ?? 'Object'),
        xCm: Number(object.xCm ?? 0),
        yCm: Number(object.yCm ?? 0),
        zCm: Number(object.zCm ?? 0),
        widthCm: Number(object.widthCm ?? 10),
        depthCm: Number(object.depthCm ?? 10),
        heightCm: Number(object.heightCm ?? 10),
        rotationY: Number(object.rotationY ?? 0),
        color: String(object.color ?? '#8FB9A8'),
      };
    })
    .filter((item): item is CageSimulationObject => !!item && !!item.id);
}

function normalizeCageSimulation(row: any): CageSimulationItem {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    animal_species: row.animal_species ?? null,
    cage_width_cm: Number(row.cage_width_cm),
    cage_depth_cm: Number(row.cage_depth_cm),
    cage_height_cm: Number(row.cage_height_cm),
    objects: normalizeObjects(row.objects),
    is_public: row.is_public,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateCageSimulationInput(input: SaveCageSimulationInput) {
  const title = input.title.trim();

  if (!title) {
    throw new Error('시뮬레이션 제목을 입력해 주세요.');
  }

  if (title.length > 80) {
    throw new Error('시뮬레이션 제목은 80자 이하로 입력해 주세요.');
  }

  if (input.animalSpecies && input.animalSpecies.trim().length > 60) {
    throw new Error('동물 종류는 60자 이하로 입력해 주세요.');
  }

  if (!Number.isFinite(input.cageWidthCm) || input.cageWidthCm <= 0 || input.cageWidthCm > 500) {
    throw new Error('케이지 가로는 1~500cm 사이로 입력해 주세요.');
  }

  if (!Number.isFinite(input.cageDepthCm) || input.cageDepthCm <= 0 || input.cageDepthCm > 500) {
    throw new Error('케이지 세로는 1~500cm 사이로 입력해 주세요.');
  }

  if (!Number.isFinite(input.cageHeightCm) || input.cageHeightCm <= 0 || input.cageHeightCm > 300) {
    throw new Error('케이지 높이는 1~300cm 사이로 입력해 주세요.');
  }

  return {
    title,
    animalSpecies: input.animalSpecies?.trim() || null,
  };
}

async function getRequiredUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  return user.id;
}

export async function createCageSimulation(input: SaveCageSimulationInput) {
  const userId = await getRequiredUserId();
  const { title, animalSpecies } = validateCageSimulationInput(input);

  const { data, error } = await supabase
    .from('cage_simulations')
    .insert({
      user_id: userId,
      title,
      animal_species: animalSpecies,
      cage_width_cm: input.cageWidthCm,
      cage_depth_cm: input.cageDepthCm,
      cage_height_cm: input.cageHeightCm,
      objects: input.objects ?? [],
      is_public: input.isPublic ?? false,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return normalizeCageSimulation(data);
}

export async function getMyCageSimulations() {
  const userId = await getRequiredUserId();

  const { data, error } = await supabase
    .from('cage_simulations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeCageSimulation);
}

export async function getCageSimulationById(simulationId: string) {
  const { data, error } = await supabase
    .from('cage_simulations')
    .select('*')
    .eq('id', simulationId)
    .single();

  if (error) {
    throw error;
  }

  return normalizeCageSimulation(data);
}

export async function updateCageSimulation(input: UpdateCageSimulationInput) {
  const userId = await getRequiredUserId();
  const { title, animalSpecies } = validateCageSimulationInput(input);

  const { data, error } = await supabase
    .from('cage_simulations')
    .update({
      title,
      animal_species: animalSpecies,
      cage_width_cm: input.cageWidthCm,
      cage_depth_cm: input.cageDepthCm,
      cage_height_cm: input.cageHeightCm,
      objects: input.objects ?? [],
      is_public: input.isPublic ?? false,
    })
    .eq('id', input.simulationId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return normalizeCageSimulation(data);
}

export async function deleteCageSimulation(simulationId: string) {
  const userId = await getRequiredUserId();

  const { error } = await supabase
    .from('cage_simulations')
    .delete()
    .eq('id', simulationId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}
