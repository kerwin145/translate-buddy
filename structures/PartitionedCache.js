// sentence partitions; will cache 5 partitions max. {partition_idx : {partition, priority})
class PartitionedCache {
  constructor(partitionPath, maxSize = 5) {
      this.maxSize = maxSize;
      this.partitionPath = partitionPath
      this.cache = new Map();
  }

  // Get sentence and update LRU order if partition exists. Else, remove LRU and add new partition
  async #queryPartition(partition_idx){
      const sentenceDict = this.cache.get(partition_idx);
      if(sentenceDict){
          console.log(`Partition ${partition_idx} already loaded in cache: ${Array.from(this.cache.keys())}`)
          this.cache.delete(partition_idx);
          this.cache.set(partition_idx, sentenceDict);
          return sentenceDict
      }

      // partition idx doesn't exist and we are full cache. we shall push out LRU
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        console.log(`LRU cache full. Pushing out ${firstKey}`)
          this.cache.delete(firstKey);
      }

      try{
        console.log(`Loading in partition ${partition_idx}`)
        const res = await fetch(chrome.runtime.getURL(`${this.partitionPath}/${partition_idx}.json`))
        const newSentenceDict = await res.json();
        this.cache.set(partition_idx, newSentenceDict);
        return newSentenceDict
      }catch(e){console.log(e)}

      return null

  }

  async getExampleSentence(term, partition_idx){
      const partition = await this.#queryPartition(partition_idx)
      return partition[term]
  }
}