<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Profil' })
</script>

<template>
  <div class="w-full max-w-2xl mx-auto">
    <CommandBar
      title="Profil"
      description="Nama, foto dan nomor HP akun staf kamu."
    />
    <ProfileForm audience="staff" />
  </div>
</template>
