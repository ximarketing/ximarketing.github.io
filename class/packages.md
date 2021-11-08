When you install packages for your R, the path must not contain any non-English characters.     

If the default path contains non-English characters, you can try the followings.     

Suppose that you want to install package "igragh", you should first create a folder for the package, e,g, C:/test.    

Then, when downloading the package, specify that it will be downloaded to the specific folder:    

```{r}
install.packages("igraph", lib = "C:/test")    
```

And when using the package, you need to load from that folder:    

```{r}
library("igraph",lib.loc="C:/test")   
```
